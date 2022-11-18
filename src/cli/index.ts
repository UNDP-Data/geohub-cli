import { Command } from 'commander';
import azblob from './azblob';
import martin from './martin';
import pgtileserv from './pgtileserv';

const program = new Command();
const version = require('../../package.json').version;
program
	.version(version, '-v, --version', 'output the version number')
	.addCommand(azblob)
	.addCommand(martin)
	.addCommand(pgtileserv);

program.parse(process.argv);
