import { mergeSettings, SETTINGS_KEY } from '../settings';
import { readForm, renderOptions, validateSettings } from './form';

const root = document.getElementById('form')!;
const status = document.getElementById('status')!;
const save = document.getElementById('save') as HTMLButtonElement;

const errorText = (e: unknown) => `Erreur : ${e instanceof Error ? e.message : String(e)}`;

// Saving before the stored settings are rendered would overwrite them with an empty form.
save.disabled = true;
chrome.storage.sync.get(SETTINGS_KEY).then(
  (stored) => {
    renderOptions(root, mergeSettings(stored[SETTINGS_KEY]));
    save.disabled = false;
  },
  (e: unknown) => (status.textContent = errorText(e)),
);

save.addEventListener('click', async () => {
  const settings = readForm(root);
  const invalid = validateSettings(settings);
  if (invalid) {
    status.textContent = invalid;
    return;
  }
  try {
    await chrome.storage.sync.set({ [SETTINGS_KEY]: settings });
  } catch (e) {
    status.textContent = errorText(e);
    return;
  }
  renderOptions(root, settings);
  status.textContent = 'Enregistré ✅';
  setTimeout(() => (status.textContent = ''), 2000);
});
