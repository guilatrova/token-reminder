// Wires the panel to Orca: asks the worker for the report and hands it to the view.
import '../protocol'

const root = document.getElementById('root')
if (!root) throw new Error('The panel page has no #root element.')

root.textContent = 'loading'
const report = await orca.plugin.request('usage.read')
root.textContent = JSON.stringify(report.accounts.map((account) => [account.provider, account.status]))
