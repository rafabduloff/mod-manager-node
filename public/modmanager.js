// public/modmanager.js

function getQueryParam(param) {
    const urlParams = new URLSearchParams(window.location.search);
    return urlParams.get(param);
}
const gameId = getQueryParam('game') || '564310';

document.addEventListener('DOMContentLoaded', () => {
    const dropZone = document.getElementById('dropZone');
    const modZipInput = document.getElementById('modZipInput');
    const fileQueueList = document.getElementById('fileQueue'); // архивы (если нужно)
    const queueList = document.getElementById('queueList'); // очередь модов
    const processQueueBtn = document.getElementById('processQueueBtn');
    const importFolderBtn = document.getElementById('importFolderBtn');
    const folderPicker = document.getElementById('folderPicker');
    const folderInput = document.getElementById('folderInput');
    const importStatus = document.getElementById('importStatus');
    const modsListContainer = document.getElementById('modsList');
    const sortSelect = document.getElementById('sortSelect');
    const launchModdedBtn = document.getElementById('launchModdedBtn');
    const launchVanillaBtn = document.getElementById('launchVanillaBtn');

    // Импорт из папки: путь вводится вручную
    importFolderBtn.addEventListener('click', async () => {
        const selectedPath = folderInput.value.trim();
        if (!selectedPath) {
            alert("Пожалуйста, введите путь для импорта модов.");
            return;
        }
        folderPicker.textContent = selectedPath;
        folderPicker.dataset.selectedPath = selectedPath;
        try {
            const res = await fetch('/queue-mods-folder?game=' + gameId, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ importPath: selectedPath, game: gameId })
            });
            const data = await res.json();
            if (!res.ok) {
                alert('Ошибка: ' + data.error);
            } else {
                alert(data.message);
                updateQueue();
            }
        } catch (error) {
            console.error(error);
            alert("Ошибка при импорте модов из папки.");
        }
    });

    // Обработчики загрузки архивов
    dropZone.addEventListener('click', () => modZipInput.click());
    dropZone.addEventListener('dragover', e => {
        e.preventDefault();
        dropZone.classList.add('dragover');
    });
    dropZone.addEventListener('dragleave', e => {
        e.preventDefault();
        dropZone.classList.remove('dragover');
    });
    dropZone.addEventListener('drop', e => {
        e.preventDefault();
        dropZone.classList.remove('dragover');
        if (e.dataTransfer.files) {
            handleFiles(e.dataTransfer.files);
        }
    });
    modZipInput.addEventListener('change', e => {
        handleFiles(e.target.files);
        modZipInput.value = '';
    });

    async function handleFiles(files) {
        for (let file of files) {
            if (file.type === "application/zip" || file.name.toLowerCase().endsWith('.zip')) {
                const formData = new FormData();
                formData.append('modZip', file);
                try {
                    const res = await fetch('/queue-mod?game=' + gameId, { method: 'POST', body: formData });
                    const data = await res.json();
                    if (!res.ok) {
                        alert('Ошибка: ' + data.error);
                    }
                } catch (error) {
                    console.error(error);
                    alert('Ошибка при добавлении файла в очередь.');
                }
            }
        }
        updateQueue();
    }

    // Функция сортировки
    function sortMods(mods, sortValue) {
        return mods.sort((a, b) => {
            switch (sortValue) {
                case 'name_asc':
                    return a.title.localeCompare(b.title);
                case 'name_desc':
                    return b.title.localeCompare(a.title);
                case 'time_asc':
                    return Number(a.modIdentifier) - Number(b.modIdentifier);
                case 'time_desc':
                    return Number(b.modIdentifier) - Number(a.modIdentifier);
                case 'weight_asc':
                    return a.weight - b.weight;
                case 'weight_desc':
                    return b.weight - a.weight;
                default:
                    return 0;
            }
        });
    }

    async function updateQueue() {
        try {
            const res = await fetch('/queue-mod?game=' + gameId);
            const data = await res.json();
            let queue = data.queuedMods;
            const sortValue = sortSelect.value;
            queue = sortMods(queue, sortValue);
            renderQueue(queue);
        } catch (error) {
            console.error('Ошибка получения очереди', error);
        }
    }

    function renderQueue(queue) {
        queueList.innerHTML = '';
        if (!queue || queue.length === 0) return;
        queue.forEach(mod => {
            const li = document.createElement('li');
            li.style.display = "flex";
            li.style.alignItems = "center";
            // Превьюшка
            const img = document.createElement('img');
            img.src = mod.icon;
            img.alt = mod.title;
            img.className = 'queue-item-img';
            li.appendChild(img);
            // Инфо
            const infoDiv = document.createElement('div');
            infoDiv.className = 'queue-item-info';
            const nameP = document.createElement('p');
            nameP.className = 'queue-item-name';
            nameP.textContent = mod.title;
            const weightP = document.createElement('p');
            weightP.className = 'queue-item-weight';
            weightP.textContent = formatWeight(mod.weight);
            infoDiv.appendChild(nameP);
            infoDiv.appendChild(weightP);
            li.appendChild(infoDiv);
            // Удаление из очереди
            const delBtn = document.createElement('button');
            delBtn.className = 'queue-item-delete';
            delBtn.textContent = '🗑️';
            delBtn.addEventListener('click', async () => {
                try {
                    const res = await fetch('/delete-queue-mod', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ modIdentifier: mod.modIdentifier, gameId })
                    });
                    const data = await res.json();
                    if (!res.ok) {
                        alert('Ошибка: ' + data.error);
                    }
                    updateQueue();
                } catch (error) {
                    console.error(error);
                }
            });
            li.appendChild(delBtn);
            queueList.appendChild(li);
        });
        setUniformWidth();
    }

    async function updateInstalledMods() {
        try {
            const res = await fetch('/import-mods?game=' + gameId);
            const data = await res.json();
            let mods = data.installedMods;
            const sortValue = sortSelect.value;
            mods = sortMods(mods, sortValue);
            renderInstalledMods(mods);
        } catch (error) {
            console.error('Ошибка получения установленных модов', error);
        }
    }

    function renderInstalledMods(mods) {
        modsListContainer.innerHTML = '';
        if (!mods || mods.length === 0) return;
        mods.forEach(mod => {
            const div = document.createElement('div');
            div.className = 'mod-item';
            // Превьюшка
            const img = document.createElement('img');
            img.src = mod.icon;
            img.alt = mod.title;
            img.className = 'mod-item-img';
            div.appendChild(img);
            // Инфо: название, вес, ID, время установки
            const infoDiv = document.createElement('div');
            infoDiv.className = 'mod-item-info';
            const nameP = document.createElement('p');
            nameP.className = 'mod-item-name';
            nameP.textContent = mod.title;
            const weightP = document.createElement('p');
            weightP.className = 'mod-item-weight';
            weightP.textContent = formatWeight(mod.weight);
            const idP = document.createElement('p');
            idP.className = 'mod-item-id';
            idP.textContent = "ID: " + mod.modIdentifier;
            const timeP = document.createElement('p');
            timeP.className = 'mod-item-installedTime';
            timeP.textContent = "Установлено: " + new Date(mod.installedAt).toLocaleString();
            infoDiv.appendChild(nameP);
            infoDiv.appendChild(weightP);
            infoDiv.appendChild(idP);
            infoDiv.appendChild(timeP);
            div.appendChild(infoDiv);
            // Действия
            const actionsDiv = document.createElement('div');
            actionsDiv.className = 'mod-item-actions';
            const toggleLabel = document.createElement('label');
            toggleLabel.className = 'toggle-switch';
            const toggleInput = document.createElement('input');
            toggleInput.type = 'checkbox';
            toggleInput.checked = mod.status === 'enabled';
            const sliderSpan = document.createElement('span');
            sliderSpan.className = 'slider';
            toggleLabel.appendChild(toggleInput);
            toggleLabel.appendChild(sliderSpan);
            toggleInput.addEventListener('change', async () => {
                try {
                    const res = await fetch('/toggle-mod', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ modIdentifier: mod.modIdentifier, gameId })
                    });
                    const data = await res.json();
                    if (!res.ok) {
                        alert('Ошибка: ' + data.error);
                    }
                    updateInstalledMods();
                } catch (error) {
                    console.error(error);
                }
            });
            actionsDiv.appendChild(toggleLabel);
            const deleteBtn = document.createElement('button');
            deleteBtn.className = 'mod-item-delete';
            deleteBtn.textContent = '🗑️';
            deleteBtn.addEventListener('click', async () => {
                if (!confirm('Удалить мод?')) return;
                try {
                    const res = await fetch('/delete-mod', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ modIdentifier: mod.modIdentifier, gameId })
                    });
                    const data = await res.json();
                    if (!res.ok) {
                        alert('Ошибка: ' + data.error);
                    }
                    updateInstalledMods();
                } catch (error) {
                    console.error(error);
                }
            });
            actionsDiv.appendChild(deleteBtn);
            div.appendChild(actionsDiv);
            modsListContainer.appendChild(div);
        });
        setUniformWidth();
    }

    // Функция форматирования веса
    function formatWeight(bytes) {
        const kb = bytes / 1024;
        if (kb < 1024) return kb.toFixed(2) + ' КБ';
        const mb = kb / 1024;
        if (mb < 1024) return mb.toFixed(2) + ' МБ';
        const gb = mb / 1024;
        return gb.toFixed(2) + ' ГБ';
    }

    // Устанавливаем одинаковую ширину для всех модовых элементов
    function setUniformWidth() {
        const modItems = document.querySelectorAll('.mod-item');
        let maxWidth = 0;
        modItems.forEach(item => {
            item.style.width = 'auto';
            const width = item.offsetWidth;
            if (width > maxWidth) maxWidth = width;
        });
        modItems.forEach(item => {
            item.style.width = maxWidth + 'px';
        });
    }

    // Запуск игры
    launchModdedBtn.addEventListener('click', async () => {
        try {
            const res = await fetch('/launch-game?game=' + gameId + '&mode=modded', { method: 'POST' });
            const data = await res.json();
            if (!res.ok) {
                alert('Ошибка запуска: ' + data.error);
            }
        } catch (error) {
            console.error(error);
            alert("Ошибка при запуске модифицированной версии.");
        }
    });

    launchVanillaBtn.addEventListener('click', async () => {
        try {
            const res = await fetch('/launch-game?game=' + gameId + '&mode=vanilla', { method: 'POST' });
            const data = await res.json();
            if (!res.ok) {
                alert('Ошибка запуска: ' + data.error);
            }
        } catch (error) {
            console.error(error);
            alert("Ошибка при запуске ванильной версии.");
        }
    });

    sortSelect.addEventListener('change', () => {
        updateQueue();
        updateInstalledMods();
    });

    updateQueue();
    updateInstalledMods();
});
