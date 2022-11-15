import { Command } from 'commander';
import azblob from './azblob';

const program = new Command();
const version = require('../../package.json').version;
program.version(version, '-v, --version', 'output the version number').addCommand(azblob);

program.parse(process.argv);
