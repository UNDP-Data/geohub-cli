import { Command } from 'commander';
import BlobServiceAccountManager from '../util/BlobServiceAccountManager';
import DatabaseManager from '../util/DatabaseManager';
import Storages from '../util/Storages';
import Datasets from '../util/Datasets';
import Tags from '../util/Tags';

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
		console.time('azblob');
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
		const storages = new Storages(_storages.flat());
		console.debug(`generated ${storages.getStorages().length} container objects`);
		const _datasets = await blobManager.scanContainers(storages.getStorages());
		const datasets = new Datasets(_datasets);
		console.debug(`generated ${datasets.getDatasets().length} dataset objects`);

		const dbManager = new DatabaseManager(database);
		console.debug(`database manager was generated.`);
		const tags: Tags = new Tags([]);

		try {
			tags.addTags(storages.getTags());
			tags.addTags(datasets.getTags());

			const client = await dbManager.transactionStart();

			await tags.insert(client);
			console.debug(`${tags.getTags().length} tags were registered into PostGIS.`);

			tags.updateTags(storages.getTags());
			tags.updateTags(datasets.getTags());

			await storages.insert(client);
			console.debug(`${storages.getStorages().length} storages were registered into PostGIS.`);

			await datasets.insert(client);
			console.debug(`${datasets.getDatasets().length} datasets were registered into PostGIS.`);
		} catch (e) {
			await dbManager.transactionRollback();
			throw e;
		} finally {
			await dbManager.transactionEnd();
			console.timeEnd('azblob');
		}

		// for debug
		// [
		// 	{ file: 'tags.json', data: tags.getTags() },
		// 	{ file: 'storages.json', data: storages.getStorages() },
		// 	{ file: 'datasets.json', data: datasets.getDatasets() }
		// ].forEach((data) => {
		// 	const filePath = path.resolve(__dirname, `../../${data.file}`);
		// 	fs.writeFileSync(filePath, JSON.stringify(data.data, null, 4));
		// 	console.debug(`exported ${filePath}`);
		// });
	});

export default program;
