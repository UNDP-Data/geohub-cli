import { Pool, PoolClient } from 'pg';
import { Dataset, Storage, Tag } from '../interfaces';

class DatabaseManager {
	private connectionString: string;

	constructor(connectionString: string) {
		this.connectionString = connectionString;
	}

	public async insertTags(tags: Tag[]) {
		const pool = new Pool({ connectionString: this.connectionString });
		const client = await pool.connect();
		try {
			await client.query('BEGIN');

			const masterTags = await this.loadTags(client);

			for (const tag of tags) {
				const masterTag = masterTags.find((t) => {
					if (tag.key) {
						return t.value === tag.value && t.key === tag.key;
					} else {
						return t.value === tag.value && !t.key;
					}
				});
				if (!masterTag) {
					let sql = `INSERT INTO geohub.tag (value) values ($1) returning id`;
					const values = [tag.value];
					if (tag.key) {
						sql = `INSERT INTO geohub.tag (value, key) values ($1, $2) returning id`;
						values.push(tag.key);
					}

					const query = {
						text: sql,
						values: values
					};

					const res = await client.query(query);
					if (res.rowCount === 0) continue;
					const id = res.rows[0].id;
					tag.id = id;
				} else {
					tag.id = masterTag.id;
				}
			}
			await client.query('COMMIT');
		} catch (err) {
			await client.query('ROLLBACK');
			throw err;
		} finally {
			client.release();
			pool.end();
		}
		return tags;
	}

	private async loadTags(client: PoolClient): Promise<Tag[]> {
		const query = {
			text: `SELECT id, value, key FROM geohub.tag`
		};
		const res = await client.query(query);
		const tags: Tag[] = [];
		if (res.rowCount === 0) return tags;
		res.rows.forEach((row) => {
			tags.push({
				id: row.id,
				value: row.value,
				key: row.key
			});
		});
		return tags;
	}

	public async insertStorages(storages: Storage[]) {
		const pool = new Pool({ connectionString: this.connectionString });
		const client = await pool.connect();
		try {
			await client.query('BEGIN');

			for (const storage of storages) {
				// insert storage
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

				if (storage.tags.length === 0) continue;
				const sql = `
                INSERT INTO geohub.storage_tag (storage_id, tag_id) values ${storage.tags
									.map((t) => `('${storage.id}', ${t.id})`)
									.join(',')}`;
				await client.query({ text: sql });
			}
			await client.query('COMMIT');
		} catch (err) {
			await client.query('ROLLBACK');
			throw err;
		} finally {
			client.release();
			pool.end();
		}
		return storages;
	}

	public async insertDatasets(datasets: Dataset[]) {
		const pool = new Pool({ connectionString: this.connectionString });
		const client = await pool.connect();
		try {
			await client.query('BEGIN');

			for (const dataset of datasets) {
				// insert dataset
				const wkt = `POLYGON((${dataset.bounds[0]} ${dataset.bounds[1]},${dataset.bounds[2]} ${dataset.bounds[1]},
                    ${dataset.bounds[2]} ${dataset.bounds[3]},${dataset.bounds[0]} ${dataset.bounds[3]},${dataset.bounds[0]} ${dataset.bounds[1]}))`;
				let query = {
					text: `
                    INSERT INTO geohub.dataset (id, storage_id, url, is_raster, source, license, bounds, createdat, updatedat) 
                    values ($1, $2, $3, $4, $5, $6, ST_GeomFROMTEXT('${wkt}', 4326), $7::timestamptz, $8::timestamptz)
                    ON CONFLICT (id)
                    DO
                    UPDATE SET storage_id=$2, url=$3, is_raster=$4, source=$5, license=$6, bounds=ST_GeomFROMTEXT('${wkt}', 4326), createdat=$7::timestamptz, updatedat=$8::timestamptz`,
					values: [
						dataset.id,
						dataset.storage.id,
						dataset.url,
						dataset.is_raster,
						dataset.source,
						dataset.license,
						dataset.createdat,
						dataset.updatedat
					]
				};
				await client.query(query);

				// insert storage_tag
				query = {
					text: `DELETE FROM geohub.dataset_tag WHERE dataset_id=$1`,
					values: [dataset.id]
				};
				await client.query(query);

				if (!(dataset.tags && dataset.tags.length > 0)) continue;
				const sql = `
                INSERT INTO geohub.dataset_tag (dataset_id, tag_id) values ${dataset.tags
									.map((t) => `('${dataset.id}', ${t.id})`)
									.join(',')}`;
				await client.query({ text: sql });
			}
			await client.query('COMMIT');
		} catch (err) {
			await client.query('ROLLBACK');
			throw err;
		} finally {
			client.release();
			pool.end();
		}
		return datasets;
	}
}

export default DatabaseManager;
