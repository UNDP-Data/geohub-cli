import { PoolClient } from 'pg';
import { concurrentPromise } from '../helpers';
import { Storage, Tag } from '../interfaces';

class Storages {
	private storages: Storage[];
	public getStorages() {
		return this.storages;
	}

	constructor(storages: Storage[]) {
		this.storages = storages;
	}

	public getTags(): Tag[] {
		const tags = this.storages.map((s) => s.tags);
		return tags.flat() || [];
	}

	public async insertAll(client: PoolClient) {
		const promises = this.storages.map((storage) => this.insert(client, storage));
		this.storages = await concurrentPromise(promises, 10);
		return this.storages;
	}

	public async insert(client: PoolClient, storage: Storage) {
		let query = {
			text: `
                INSERT INTO geohub.storage (id, name, url, label, description, icon) 
                values ($1, $2, $3, $4, $5, $6)
                ON CONFLICT (id)
                DO
                UPDATE SET name=$2, url=$3, label=$4, description=$5, icon=$6`,
			values: [
				storage.id,
				storage.name,
				storage.url,
				storage.label,
				storage.description,
				storage.icon
			]
		};
		await client.query(query);

		// insert storage_tag
		query = {
			text: `DELETE FROM geohub.storage_tag WHERE storage_id=$1`,
			values: [storage.id]
		};
		await client.query(query);

		if (storage.tags.length === 0) {
			const sql = `
            INSERT INTO geohub.storage_tag (storage_id, tag_id) values ${storage.tags
							.map((t) => `('${storage.id}', ${t.id})`)
							.join(',')}`;
			await client.query({ text: sql });
		}
		return storage;
	}
}

export default Storages;
