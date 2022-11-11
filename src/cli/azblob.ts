import { Command } from 'commander';
import BlobServiceAccountManager from '../util/BlobServiceAccountManager';
import fs from 'fs';
import path from 'path';
import { Tag } from '../interfaces';

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
		// const database: string = options.database;
		const azaccount: string = options.azaccount;
		const azaccountkey: string = options.azaccountkey;
		const containerNames: string[] = options.name;
		// console.log({ database, azaccount, azaccountkey, containerNames });

		const blobManager = new BlobServiceAccountManager(azaccount, azaccountkey);
		const promises = containerNames.map((name) => blobManager.listContainers(name));
		const _storages = await Promise.all(promises);
		const storages = _storages.flat();
		const datasets = await blobManager.scanContainers(storages);

		const tags: Tag[] = [];
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

		fs.writeFileSync(path.resolve(__dirname, '../../tags.json'), JSON.stringify(tags, null, 4));
		fs.writeFileSync(
			path.resolve(__dirname, '../../storages.json'),
			JSON.stringify(storages, null, 4)
		);
		fs.writeFileSync(
			path.resolve(__dirname, '../../datasets.json'),
			JSON.stringify(datasets, null, 4)
		);
	});

export default program;
