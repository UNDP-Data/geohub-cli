import { Command } from 'commander';
import { BlobServiceAccountManager, DatabaseManager, Storages, Datasets, Tags } from '../util';
import fs from 'fs';
import path from 'path';

const program = new Command();
program
	.name('azblob')
	.description('scan azure blob containers to register metadata into PostgreSQL database.')
	.requiredOption('-d, --database <dsn>', 'PostgreSQL database connection string')
	.requiredOption('-a, --azaccount <azure_storage_account>', 'Azure Storage Account')
	.requiredOption('-k, --azaccountkey <azure_storage_access_key>', 'Azure Storage Access Key')
	.option(
		'-n, --name [container_name...]',
		'Targeted Azure Blob Container name to scan. It will scan all containers if it is not specified.'
	)
	.option(
		'-o, --output [output]',
		'Output directory for temporary working folder. Default is tmp folder',
		'tmp'
	)
	.action(async () => {
		console.time('azblob');
		const options = program.opts();
		const database: string = options.database;
		const azaccount: string = options.azaccount;
		const azaccountkey: string = options.azaccountkey;
		const containerNames: string[] = options.name;
		const outputDir: string = path.resolve(options.output);
		if (!fs.existsSync(outputDir)) {
			fs.mkdirSync(outputDir);
		}

		console.debug(
			`loaded parameters: ${JSON.stringify({ database, azaccount, azaccountkey, containerNames })}`
		);

		const blobManager = new BlobServiceAccountManager(azaccount, azaccountkey);
		let storages: Storages;
		if (containerNames) {
			const promises = containerNames.map((name) => blobManager.listContainers(name));
			console.debug(`loaded ${promises.length} containers.`);
			const _storages = await Promise.all(promises);
			storages = new Storages(_storages.flat());
		} else {
			const _storages = await blobManager.listContainers();
			storages = new Storages(_storages);
		}

		console.debug(`generated ${storages.getStorages().length} container objects`);
		const _datasets = await blobManager.scanContainers(storages.getStorages());
		const datasets = new Datasets(_datasets, outputDir);
		console.debug(`generated ${datasets.getDatasets().length} dataset objects`);

		const dbManager = new DatabaseManager(database);
		console.debug(`database manager was generated.`);
		const tags: Tags = new Tags([]);

		try {
			storages.addTags(tags);
			datasets.addTags(tags);
			const client = await dbManager.transactionStart();

			await tags.insert(client);
			console.debug(`${tags.getTags().length} tags were registered into PostGIS.`);

			storages.updateTags(tags);
			datasets.updateTags(tags);

			await storages.insertAll(client);
			console.debug(`${storages.getStorages().length} storages were registered into PostGIS.`);

			await datasets.insertAll(client);
			console.debug(`${datasets.getDatasets().length} datasets were registered into PostGIS.`);

			await tags.cleanup(client);
			console.debug(`unused tags were cleaned`);
		} catch (e) {
			await dbManager.transactionRollback();
			throw e;
		} finally {
			await dbManager.transactionEnd();
			console.timeEnd('azblob');
		}

		// for debug
		[
			{ file: 'tags.json', data: tags.getTags() },
			{ file: 'storages.json', data: storages.getStorages() },
			{ file: 'datasets.json', data: datasets.getDatasets() }
		].forEach((data) => {
			const filePath = path.resolve(outputDir, data.file);
			fs.writeFileSync(filePath, JSON.stringify(data.data, null, 4));
			console.debug(`exported ${filePath}`);
		});
	});

export default program;
