import { mergeSettings, SETTINGS_KEY } from '../settings';
import { readForm, renderOptions } from './form';

const root = document.getElementById('form')!;
const status = document.getElementById('status')!;

void chrome.storage.sync.get(SETTINGS_KEY).then((stored) => renderOptions(root, mergeSettings(stored[SETTINGS_KEY])));

document.getElementById('save')!.addEventListener('click', async () => {
  const settings = readForm(root);
  await chrome.storage.sync.set({ [SETTINGS_KEY]: settings });
  renderOptions(root, settings);
  status.textContent = 'Enregistré ✅';
  setTimeout(() => (status.textContent = ''), 2000);
});
