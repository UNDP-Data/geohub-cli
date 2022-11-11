import {
	// AccountSASPermissions,
	BlobServiceClient,
	ContainerItem,
	ServiceListContainersOptions,
	StorageSharedKeyCredential
	// generateBlobSASQueryParameters,
	// BlobSASPermissions
} from '@azure/storage-blob';
import cliProgress from 'cli-progress';

interface BlobMetadata {
	description: string;
	icon: string;
	label: string;
	published: string;
	tags: string;
}

class BlobServiceAccountManager {
	private azAccount: string;
	private azAccountKey: string;
	private blobServiceClient: BlobServiceClient;

	constructor(azAccount: string, azAccountKey: string) {
		this.azAccount = azAccount;
		this.azAccountKey = azAccountKey;

		const sharedKeyCredential = new StorageSharedKeyCredential(this.azAccount, this.azAccountKey);
		this.blobServiceClient = new BlobServiceClient(
			`https://${this.azAccount}.blob.core.windows.net`,
			sharedKeyCredential
		);
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

		const containerItems: ContainerItem[] = [];

		for await (const containerItem of this.blobServiceClient.listContainers(options)) {
			const metadata: BlobMetadata = containerItem.metadata as unknown as BlobMetadata;
			if (metadata.published !== 'true') continue;
			containerItems.push(containerItem);
		}
		return containerItems;
	}

	public async register(containerItems: ContainerItem[]) {
		const pb = new cliProgress.SingleBar({}, cliProgress.Presets.shades_classic);
		pb.start(containerItems.length - 1, 0);
		containerItems.forEach((container: ContainerItem, index: number) => {
			pb.update(index, { containerName: container.name });
		});
		pb.stop();
	}
}

export default BlobServiceAccountManager;
