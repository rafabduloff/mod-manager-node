// script.js
document.addEventListener('DOMContentLoaded', () => {
    const dropZone = document.getElementById('dropZone');
    const modZipInput = document.getElementById('modZipInput');
    const fileQueueList = document.getElementById('fileQueue');
    const uploadAllBtn = document.getElementById('uploadAllBtn');
    const uploadStatus = document.getElementById('uploadStatus');
    const modsListContainer = document.getElementById('modsList');

    // При выборе файлов сразу отправляем их на сервер для добавления в очередь
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

    // Локальная очередь не хранится, сразу отправляем файл на сервер в очередь
    async function handleFiles(files) {
        for (let file of files) {
            if (file.type === "application/zip" || file.name.toLowerCase().endsWith('.zip')) {
                const formData = new FormData();
                formData.append('modZip', file);
                try {
                    const res = await fetch('/queue-mod', { method: 'POST', body: formData });
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

    // Обновление очереди загрузки
    async function updateQueue() {
        try {
            const res = await fetch('/queue-mod');
            const data = await res.json();
            renderQueue(data.queuedMods);
        } catch (error) {
            console.error('Ошибка получения очереди', error);
        }
    }

    // Отображаем очередь загрузки как список иконок
    function renderQueue(queue) {
        fileQueueList.innerHTML = '';
        if (!queue || queue.length === 0) return;
        queue.forEach(mod => {
            const li = document.createElement('li');
            const img = document.createElement('img');
            img.src = mod.icon;
            img.alt = mod.title;
            img.style.width = '60px';
            img.style.height = '60px';
            li.appendChild(img);
            // Кнопка удаления из очереди
            const delBtn = document.createElement('button');
            delBtn.className = 'btn-delete';
            delBtn.innerHTML = '🗑️';
            delBtn.addEventListener('click', async () => {
                try {
                    const res = await fetch('/delete-queue-mod', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ modIdentifier: mod.modIdentifier })
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
            fileQueueList.appendChild(li);
        });
    }

    // Кнопка для окончательной установки модов из очереди
    const processQueueBtn = document.getElementById('processQueueBtn');
    processQueueBtn.addEventListener('click', async () => {
        try {
            const res = await fetch('/process-queue', { method: 'POST' });
            const data = await res.json();
            if (!res.ok) {
                alert('Ошибка: ' + data.error);
            } else {
                alert(data.message);
                updateQueue();
                updateInstalledMods();
            }
        } catch (error) {
            console.error(error);
        }
    });

    // Обновление установленных модов (отображаются как иконки)
    async function updateInstalledMods() {
        try {
            const res = await fetch('/mods');
            const data = await res.json();
            renderInstalledMods(data.installedMods);
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
            const img = document.createElement('img');
            img.src = mod.icon;
            img.alt = mod.title;
            div.appendChild(img);
            // Блок действий: тумблер + кнопка удаления
            const actionsDiv = document.createElement('div');
            actionsDiv.className = 'mod-actions';

            // Тумблер
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
                        body: JSON.stringify({ modIdentifier: mod.modIdentifier })
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

            // Кнопка удаления
            const deleteBtn = document.createElement('button');
            deleteBtn.className = 'btn-delete';
            deleteBtn.innerHTML = '🗑️';
            deleteBtn.addEventListener('click', async () => {
                if (!confirm('Удалить мод?')) return;
                try {
                    const res = await fetch('/delete-mod', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ modIdentifier: mod.modIdentifier })
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
    }

    // Первоначальное обновление очереди и установленных модов
    updateQueue();
    updateInstalledMods();
});
