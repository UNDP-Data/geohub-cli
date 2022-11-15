import {
	BlobServiceClient,
	ContainerClient,
	ServiceListContainersOptions,
	StorageSharedKeyCredential
} from '@azure/storage-blob';
import type { ContainerMetadata, Dataset, Storage, Tag } from '../interfaces';
import {
	generateHashKey,
	generateSasToken,
	getBase64EncodedUrl,
	isRasterExtension
} from '../helpers';

class BlobServiceAccountManager {
	private azAccount: string;
	private azAccountKey: string;
	private blobServiceClient: BlobServiceClient;
	private sasToken: string;
	private baseUrl: string;

	constructor(azAccount: string, azAccountKey: string) {
		this.azAccount = azAccount;
		this.azAccountKey = azAccountKey;

		this.baseUrl = `https://${this.azAccount}.blob.core.windows.net`;

		const sharedKeyCredential = new StorageSharedKeyCredential(this.azAccount, this.azAccountKey);
		this.blobServiceClient = new BlobServiceClient(this.baseUrl, sharedKeyCredential);
		this.sasToken = generateSasToken(this.blobServiceClient);
	}

	public async listContainers(containerName?: string) {
		const options: ServiceListContainersOptions = {
			includeDeleted: false,
			includeMetadata: true,
			includeSystem: true
		};
		if (containerName) {
			options.prefix = containerName;
		}

		const storages: Storage[] = [];

		for await (const containerItem of this.blobServiceClient.listContainers(options)) {
			const metadata: ContainerMetadata = containerItem.metadata as unknown as ContainerMetadata;
			if (metadata.published !== 'true') continue;
			const tagValues: string[] = metadata.tags.split(',');
			const tags: Tag[] = tagValues.map((tag) => {
				const t: Tag = { value: tag.trim() };
				return t;
			});
			if (metadata.sdg) {
				tags.push({
					key: 'sdg',
					value: metadata.sdg
				});
			}
			const url = `${this.baseUrl}/${containerItem.name}`;
			const storage: Storage = {
				id: generateHashKey(url),
				name: containerItem.name,
				url: url,
				label: metadata.label,
				description: metadata.description,
				icon: metadata.icon,
				tags: tags.filter((t) => t.value.length > 0)
			};
			storages.push(storage);
		}
		return storages;
	}

	public async scanContainers(storages: Storage[]): Promise<Dataset[]> {
		const datasets: Dataset[] = [];
		for (const storage of storages) {
			const results = await this.scanContainer(storage);
			Array.prototype.push.apply(datasets, results);
		}
		return datasets;
	}

	public async scanContainer(storage: Storage) {
		console.debug(`${storage.name} started scanning`);
		const containerClient = this.blobServiceClient.getContainerClient(storage.name);
		const datasets = await this.listBlobs(containerClient, storage);
		console.debug(`${storage.name} ended scanning ${datasets.length} datasets`);
		return datasets;
	}

	public async listBlobs(containerClient: ContainerClient, storage: Storage, path?: string) {
		let datasets: Dataset[] = [];
		for await (const item of containerClient.listBlobsByHierarchy('/', { prefix: path })) {
			if (item.kind === 'prefix') {
				// folder
				const metadataJsonFileName = `${item.name}metadata.json`;
				const bclient = containerClient.getBlobClient(metadataJsonFileName);
				const isVectorTile: boolean = await bclient.exists();
				if (isVectorTile) {
					const dataset = await this.createDataset(containerClient, storage, metadataJsonFileName);
					if (!dataset) continue;
					datasets.push(dataset);
				} else {
					const dataset = await this.listBlobs(containerClient, storage, item.name);
					if (dataset.length === 0) continue;
					datasets = [...datasets, ...dataset];
				}
			} else {
				// blob
				const dataset = await this.createDataset(containerClient, storage, item.name);
				if (!dataset) continue;
				datasets.push(dataset);
			}
		}
		return datasets;
	}

	private async createDataset(
		containerClient: ContainerClient,
		storage: Storage,
		itemName: string
	) {
		let isRaster = false;
		if (itemName.indexOf('metadata.json') === -1) {
			// raster
			if (isRasterExtension(itemName)) {
				isRaster = true;
			} else {
				return;
			}
		}

		const blockBlobClient = containerClient.getBlockBlobClient(itemName);
		const result = await blockBlobClient.getTags();
		let tags: Tag[] = [];
		for (const tag in result.tags) {
			tags.push({
				key: tag,
				value: result.tags[tag]
			});
		}

		const strageTags = storage.tags;
		const sdgTags = strageTags.filter((t) => t.key && t.key === 'sdg');
		if (sdgTags.length > 0) {
			tags = [...tags, ...sdgTags];
		}

		const url = blockBlobClient.url;
		const properties = await blockBlobClient.getProperties();
		const bounds = isRaster ? await this.getRasterBounds(url) : await this.getVectorBounds(url);
		const dataset: Dataset = {
			id: generateHashKey(url),
			url: url,
			is_raster: isRaster,
			bounds: bounds,
			storage: storage,
			tags: tags,
			createdat: properties.createdOn ? properties.createdOn.toISOString() : '',
			updatedat: properties.lastModified ? properties.lastModified.toISOString() : ''
		};
		return dataset;
	}

	private async getRasterBounds(url: string) {
		const fileUrl = `${url}${this.sasToken}`;
		const apiUrl = `https://titiler.undpgeohub.org/cog/bounds?url=${getBase64EncodedUrl(fileUrl)}`;
		const res = await fetch(apiUrl);
		const json = await res.json();
		return (json.bounds ? json.bounds : [-180, -90, 180, 90]) as [number, number, number, number];
	}

	private async getVectorBounds(url: string) {
		const apiUrl = `${url}${this.sasToken}`;
		const res = await fetch(apiUrl);
		const metadata = await res.json();
		const bounds: string = metadata.bounds;
		return (bounds ? bounds.split(',').map((b) => Number(b)) : [-180, -90, 180, 90]) as [
			number,
			number,
			number,
			number
		];
	}
}

export default BlobServiceAccountManager;
