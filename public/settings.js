// settings.js
// Получаем gameId из параметра URL
function getQueryParam(param) {
    const urlParams = new URLSearchParams(window.location.search);
    return urlParams.get(param);
}
const gameId = getQueryParam('game') || 'serioussamfusion';

const baseGamePathPicker = document.getElementById('baseGamePathPicker');
const baseGamePathDisplay = document.getElementById('baseGamePathDisplay');
const settingsForm = document.getElementById('settingsForm');
const settingsStatus = document.getElementById('settingsStatus');

baseGamePathDisplay.addEventListener('click', () => {
    baseGamePathPicker.click();
});

baseGamePathPicker.addEventListener('change', (e) => {
    const files = e.target.files;
    if (files.length > 0) {
        const fullPath = files[0].webkitRelativePath;
        const folderName = fullPath.split('/')[0];
        baseGamePathDisplay.textContent = folderName;
        baseGamePathDisplay.dataset.selectedPath = folderName;
    }
});

settingsForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const selectedPath = baseGamePathDisplay.dataset.selectedPath;
    if (!selectedPath) {
        settingsStatus.textContent = 'Пожалуйста, выберите папку игры.';
        return;
    }
    // Сохраняем настройки в localStorage для конкретной игры
    const settings = { baseGamePath: selectedPath };
    localStorage.setItem(gameId + 'Settings', JSON.stringify(settings));
    settingsStatus.textContent = 'Настройки сохранены.';
});

window.addEventListener('load', () => {
    const saved = localStorage.getItem(gameId + 'Settings');
    if (saved) {
        const settings = JSON.parse(saved);
        baseGamePathDisplay.textContent = settings.baseGamePath;
        baseGamePathDisplay.dataset.selectedPath = settings.baseGamePath;
    }
});
