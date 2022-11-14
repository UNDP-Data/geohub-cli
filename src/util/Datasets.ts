import { PoolClient } from 'pg';
import { concurrentPromise } from '../helpers';
import { Dataset, Tag } from '../interfaces';

class Datasets {
	private datasets: Dataset[];
	public getDatasets() {
		return this.datasets;
	}

	constructor(datasets: Dataset[]) {
		this.datasets = datasets;
	}

	public getTags(): Tag[] {
		const tags: Tag[][] = [];
		this.datasets.forEach((d) => {
			if (!d.tags) return;
			tags.push(d.tags);
		});
		return tags.flat();
	}

	public async insertAll(client: PoolClient) {
		const promises = this.datasets.map((dataset) => this.insert(client, dataset));
		this.datasets = await concurrentPromise(promises, 10);
		return this.datasets;
	}

	public async insert(client: PoolClient, dataset: Dataset) {
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

		if (dataset.tags && dataset.tags.length > 0) {
			const sql = `
			INSERT INTO geohub.dataset_tag (dataset_id, tag_id) values ${dataset.tags
				.map((t) => `('${dataset.id}', ${t.id})`)
				.join(',')}`;
			await client.query({ text: sql });
		}

		return dataset;
	}
}

export default Datasets;
