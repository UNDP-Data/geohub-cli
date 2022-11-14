import { PoolClient } from 'pg';
import { Tag } from '../interfaces';

class Tags {
	private tags: Tag[];
	public getTags() {
		return this.tags;
	}
	public setTags(tags: Tag[]) {
		this.tags = tags;
	}

	constructor(tags: Tag[]) {
		this.tags = tags || [];
	}

	public addTags(tags: Tag[]) {
		tags.forEach((x: Tag) => {
			const tag = this.tags.find((y) => y.value === x.value && y.key === x.key);
			if (!tag) {
				this.tags.push(x);
			}
		});
		return this.tags;
	}

	public updateTags(tags: Tag[]) {
		tags.forEach((x: Tag) => {
			const tag = this.tags.find((y) => y.value === x.value && y.key === x.key);
			x.id = tag?.id;
		});
		return this.tags;
	}

	public async insert(client: PoolClient) {
		const masterTags = await this.load(client);

		for (const tag of this.tags) {
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
		return this.tags;
	}

	private async load(client: PoolClient): Promise<Tag[]> {
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
}

export default Tags;
