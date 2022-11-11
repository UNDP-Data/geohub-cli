import { Command } from 'commander';
import fs from 'fs';
import path from 'path';
import { Tag } from '../interfaces';
import BlobServiceAccountManager from '../util/BlobServiceAccountManager';
import DatabaseManager from '../util/DatabaseManager';

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
	.action(async () => {
		const options = program.opts();
		const database: string = options.database;
		const azaccount: string = options.azaccount;
		const azaccountkey: string = options.azaccountkey;
		const containerNames: string[] = options.name;

		console.debug(
			`loaded parameters: ${JSON.stringify({ database, azaccount, azaccountkey, containerNames })}`
		);

		const blobManager = new BlobServiceAccountManager(azaccount, azaccountkey);
		const promises = containerNames.map((name) => blobManager.listContainers(name));
		console.debug(`loaded ${promises.length} containers.`);
		const _storages = await Promise.all(promises);
		let storages = _storages.flat();
		console.debug(`generated ${storages.length} container objects`);
		let datasets = await blobManager.scanContainers(storages);
		console.debug(`generated ${datasets.length} dataset objects`);

		let tags: Tag[] = [];
		storages.forEach((storage) => {
			storage.tags.forEach((x) => {
				const tag = tags.find((y) => y.value === x.value && y.key === x.key);
				if (!tag) {
					tags.push(x);
				}
			});
		});

		datasets.forEach((dataset) => {
			dataset.tags?.forEach((x) => {
				const tag = tags.find((y) => y.value === x.value && y.key === x.key);
				if (!tag) {
					tags.push(x);
				}
			});
		});

		const dbManager = new DatabaseManager(database);
		console.debug(`database manager was generated.`);

		tags = await dbManager.insertTags(tags);
		console.debug(`${tags.length} tags were registered into PostGIS.`);

		storages.forEach((storage) => {
			storage.tags.forEach((x) => {
				const tag = tags.find((y) => y.value === x.value && y.key === x.key);
				x.id = tag?.id;
			});
		});

		datasets.forEach((dataset) => {
			dataset.tags?.forEach((x) => {
				const tag = tags.find((y) => y.value === x.value && y.key === x.key);
				x.id = tag?.id;
			});
		});

		storages = await dbManager.insertStorages(storages);
		console.debug(`${storages.length} storages were registered into PostGIS.`);

		datasets = await dbManager.insertDatasets(datasets);
		console.debug(`${datasets.length} datasets were registered into PostGIS.`);

		[
			{ file: 'tags.json', data: tags },
			{ file: 'storages.json', data: storages },
			{ file: 'datasets.json', data: datasets }
		].forEach((data) => {
			const filePath = path.resolve(__dirname, `../../${data.file}`);
			fs.writeFileSync(filePath, JSON.stringify(data.data, null, 4));
			console.debug(`exported ${filePath}`);
		});
	});

export default program;
