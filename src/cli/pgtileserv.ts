import { Command } from 'commander';
import fs from 'fs';
import path from 'path';
import { DatabaseManager, Datasets, PgtileservManager, Storages, Tags } from '../util';

const program = new Command();
program
	.name('pgtileserv')
	.description('scan pg_tileserv layers to register metadata into PostgreSQL database.')
	.requiredOption('-d, --database <dsn>', 'PostgreSQL database connection string')
	.option(
		'-p, --pgtileserv-url [pgtileserv-url]',
		'URL for pg_tileserv index.json',
		'https://pgtileserv.undpgeohub.org/index.json'
	)
	.option('-o, --output [output]', 'Output directory for temporary working folder', 'tmp')
	.action(async () => {
		console.time('azblob');
		const options = program.opts();
		const database: string = options.database;
		const pgtileservUrl: string = options.pgtileservUrl;
		const outputDir: string = path.resolve(options.output);
		if (!fs.existsSync(outputDir)) {
			fs.mkdirSync(outputDir);
		}

		console.debug(`loaded parameters: ${JSON.stringify({ database, pgtileservUrl })}`);

		const pgtileservManager = new PgtileservManager(pgtileservUrl);
		const data = await pgtileservManager.load();

		const storages = new Storages(data.storages);
		console.log(`${storages.getStorages().length} storage object were created`);
		const datasets = new Datasets(data.datasets, outputDir);
		console.log(`${datasets.getDatasets().length} dataset object were created`);

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
	});

export default program;
