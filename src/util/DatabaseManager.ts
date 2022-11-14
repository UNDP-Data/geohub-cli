import { Pool, PoolClient } from 'pg';

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
}

export default DatabaseManager;