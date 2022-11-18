import { Pool, PoolClient } from 'pg';
import Datasets from './Datasets';
import Storages from './Storages';
import Tags from './Tags';

class DatabaseManager {
	private connectionString: string;
	private pool: Pool | undefined = undefined;
	private client: PoolClient | undefined = undefined;

	constructor(connectionString: string) {
		this.connectionString = connectionString;
	}

	public async transactionStart() {
		this.pool = new Pool({ connectionString: this.connectionString });
		this.client = await this.pool.connect();
		await this.client.query('BEGIN');
		console.info('Transaction started');
		return this.client;
	}

	public async transactionRollback() {
		await this.client?.query('ROLLBACK');
		console.info('Transaction rollbacked');
	}

	public async transactionEnd() {
		await this.client?.query('COMMIT');
		console.info('Transaction ended');
		this.client?.release();
		this.pool?.end();
	}

	public async registerAll(storages: Storages, datasets: Datasets) {
		const tags: Tags = new Tags([]);

		try {
			storages.addTags(tags);
			datasets.addTags(tags);
			const client = await this.transactionStart();

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
			await this.transactionRollback();
			throw e;
		} finally {
			await this.transactionEnd();
		}
	}
}

export default DatabaseManager;
