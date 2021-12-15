import 'dotenv/config.js'
import { startService } from './service'

import { Command } from 'commander'

const program = new Command();

program
  .command('startService', { isDefault: true })
  .description('Starts this service.')
  .action(async () => { await startService() })

program
  .command('help')
  .action(() => { program.help() })

program.parse(process.argv)
