import { Command } from 'commander'

const program = new Command()
program
  .name('azblob')
  .description('scan azure blob containers to register metadata into PostgreSQL database.')
  .requiredOption(
    '-d, --database <dsn>', 'PostgreSQL database connection string'
  )
  .requiredOption(
    '-a, --azaccount <azure_storage_account>', 'Azure Storage Account'
  )
  .requiredOption(
    '-k, --azaccountkey <azure_storage_access_key>', 'Azure Storage Access Key'
  )
  .option(
    '-n, --name [container_name...]',
    'Targeted Azure Blob Container name to scan. It will scan all containers if it is not specified.',
  )
  .action(async () => {
    const options = program.opts()
    const database: string = options.database
    const azaccount: string = options.azaccount
    const azaccountkey: string = options.azaccountkey
    const containerNames: string[] = options.name
    console.log({database, azaccount, azaccountkey, containerNames})
  })

export default program
