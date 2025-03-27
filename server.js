const express = require('express');
const multer = require('multer');
const AdmZip = require('adm-zip');
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

const app = express();
const PORT = 3000;

app.use(express.json());
app.use('/temp', express.static(path.join(__dirname, 'temp')));

const config = JSON.parse(fs.readFileSync('config.json', 'utf-8'));

/**
 * Обновлённая функция computeGamePaths:
 * Для модов, создаётся подкаталог с gameId.
 */
function getGameConfig(gameId) {
    return config.games.find(g => g.id === gameId) || config.games[0];
}
function computeGamePaths(gameConfig) {
    const baseGamePath = gameConfig.baseGamePath;
    const modsFolder = path.join(baseGamePath, gameConfig.modsFolder, gameConfig.id);
    return { baseGamePath, modsFolder };
}

/**
 * Для отключённых модов и misc создаём подкаталоги по gameId
 */
function computeDisabledPath(gameId) {
    return path.join(__dirname, 'disabled', gameId);
}
function computeMiscPath(gameId) {
    return path.join(__dirname, config.miscFolder, gameId);
}

const disabledBase = path.join(__dirname, 'disabled');
const miscBase = path.join(__dirname, config.miscFolder);
[disabledBase, miscBase].forEach(folder => {
    if (!fs.existsSync(folder)) fs.mkdirSync(folder, { recursive: true });
});

let installedMods = [];
const modsJsonPath = 'mods.json';
function loadInstalledMods() {
    try {
        const data = fs.readFileSync(modsJsonPath, 'utf-8');
        return JSON.parse(data).installedMods;
    } catch (err) {
        return [];
    }
}
function saveInstalledMods(installedMods) {
    fs.writeFileSync(modsJsonPath, JSON.stringify({ installedMods }, null, 2));
}
installedMods = loadInstalledMods();
let queuedMods = [];

const upload = multer({ dest: 'uploads/' });

app.use(express.static('public'));
app.use('/misc', express.static(computeMiscPath(''))); // базовая misc

function extractModInfo(zipFilePath, uniqueFolder) {
    const zip = new AdmZip(zipFilePath);
    zip.extractAllTo(uniqueFolder, true);
    const files = fs.readdirSync(uniqueFolder);
    let groFile, jpgFile, txtFile;
    files.forEach(file => {
        const lower = file.toLowerCase();
        if (lower.endsWith('.gro')) groFile = file;
        else if (lower.endsWith('.jpg')) jpgFile = file;
        else if (lower.endsWith('.txt')) txtFile = file;
    });
    if (!groFile || !jpgFile || !txtFile) {
        throw new Error('Архив должен содержать файлы .gro, .jpg и .txt');
    }
    const txtContent = fs.readFileSync(path.join(uniqueFolder, txtFile), 'utf-8');
    const parts = txtContent.split('#').filter(Boolean);
    const title = parts[1] || 'Unknown Mod';
    const groPath = path.join(uniqueFolder, groFile);
    const stats = fs.statSync(groPath);
    const weight = stats.size;
    return { title, groFile, jpgFile, txtFile, groPath, weight };
}

function extractModIdFromFilename(filename) {
    const match = filename.match(/^zz(\d+)\.zip$/i);
    return match ? match[1] : null;
}

app.post('/queue-mod', upload.single('modZip'), (req, res) => {
    try {
        const gameId = req.query.game || req.body.game || config.games[0].id;
        const gameConfig = getGameConfig(gameId);
        const { modsFolder } = computeGamePaths(gameConfig);
        if (!fs.existsSync(modsFolder)) fs.mkdirSync(modsFolder, { recursive: true });
        const disabledPath = computeDisabledPath(gameId);
        if (!fs.existsSync(disabledPath)) fs.mkdirSync(disabledPath, { recursive: true });
        const miscPath = computeMiscPath(gameId);
        if (!fs.existsSync(miscPath)) fs.mkdirSync(miscPath, { recursive: true });

        const zipPath = path.resolve(req.file.path);
        const originalName = req.file.originalname;
        let modId = extractModIdFromFilename(originalName);
        if (!modId) modId = Date.now().toString();
        const uniqueFolder = path.join(__dirname, 'temp', Date.now().toString());
        fs.mkdirSync(uniqueFolder, { recursive: true });
        const { title, groFile, jpgFile, txtFile, groPath, weight } = extractModInfo(zipPath, uniqueFolder);
        const modIdentifier = modId;
        const iconURL = `/temp/${path.basename(uniqueFolder)}/${jpgFile}`;
        const queuedMod = {
            modIdentifier,
            title,
            weight,
            groFileName: groFile,
            tempGroPath: groPath,
            icon: iconURL,
            jpgFile: jpgFile,
            queueFolder: uniqueFolder,
            gameId,
            queuedAt: Date.now()
        };
        if (queuedMods.find(m => m.modIdentifier === queuedMod.modIdentifier && m.gameId === queuedMod.gameId)) {
            fs.rmSync(uniqueFolder, { recursive: true, force: true });
            fs.unlinkSync(zipPath);
            return res.status(400).json({ error: 'Мод с таким идентификатором уже в очереди.' });
        }
        queuedMods.push(queuedMod);
        fs.unlinkSync(zipPath);
        return res.json({ message: 'Мод добавлен в очередь.', queuedMod, queuedMods });
    } catch (err) {
        console.error('Ошибка при добавлении в очередь:', err);
        return res.status(400).json({ error: err.message });
    }
});

app.get('/queue-mod', (req, res) => {
    const gameId = req.query.game || config.games[0].id;
    const gameQueue = queuedMods.filter(m => m.gameId === gameId);
    res.json({ queuedMods: gameQueue });
});

app.post('/delete-queue-mod', (req, res) => {
    try {
        const { modIdentifier, gameId } = req.body;
        const index = queuedMods.findIndex(m => m.modIdentifier === modIdentifier && m.gameId === gameId);
        if (index === -1) return res.status(404).json({ error: 'Мод не найден в очереди.' });
        const mod = queuedMods[index];
        fs.rmSync(mod.queueFolder, { recursive: true, force: true });
        queuedMods.splice(index, 1);
        return res.json({ message: 'Мод удалён из очереди.', queuedMods });
    } catch (err) {
        console.error('Ошибка при удалении из очереди:', err);
        return res.status(500).json({ error: 'Ошибка при удалении.' });
    }
});

app.post('/process-queue', (req, res) => {
    try {
        const gameId = req.query.game || req.body.game || config.games[0].id;
        const gameConfig = getGameConfig(gameId);
        const { modsFolder } = computeGamePaths(gameConfig);
        if (!fs.existsSync(modsFolder)) fs.mkdirSync(modsFolder, { recursive: true });
        const miscPath = computeMiscPath(gameId);
        if (!fs.existsSync(miscPath)) fs.mkdirSync(miscPath, { recursive: true });
        const processedMods = [];
        queuedMods = queuedMods.filter(mod => {
            if (mod.gameId !== gameId) return true;
            if (installedMods.find(m => m.modIdentifier === mod.modIdentifier && m.gameId === gameId)) {
                fs.rmSync(mod.queueFolder, { recursive: true, force: true });
                return false;
            }
            const targetGroPath = path.join(modsFolder, mod.groFileName);
            fs.copyFileSync(mod.tempGroPath, targetGroPath);
            fs.unlinkSync(mod.tempGroPath);
            const txtFilePath = path.join(mod.queueFolder, fs.readdirSync(mod.queueFolder).find(f => f.toLowerCase().endsWith('.txt')));
            if (fs.existsSync(txtFilePath)) fs.unlinkSync(txtFilePath);
            const sourceJpgPath = path.join(mod.queueFolder, mod.jpgFile);
            const targetJpgPath = path.join(miscPath, mod.jpgFile);
            if (fs.existsSync(sourceJpgPath)) {
                fs.copyFileSync(sourceJpgPath, targetJpgPath);
                fs.unlinkSync(sourceJpgPath);
            }
            const installedMod = {
                title: mod.title,
                modIdentifier: mod.modIdentifier,
                weight: mod.weight,
                groFile: targetGroPath,
                status: "enabled",
                installedAt: new Date().toISOString(),
                gameId,
                icon: `/misc/${gameId}/${mod.jpgFile}`
            };
            installedMods.push(installedMod);
            processedMods.push(installedMod);
            fs.rmSync(mod.queueFolder, { recursive: true, force: true });
            return false;
        });
        saveInstalledMods(installedMods);
        return res.json({ message: 'Очередь обработана.', processedMods, installedMods });
    } catch (err) {
        console.error('Ошибка при обработке очереди:', err);
        return res.status(500).json({ error: 'Ошибка при установке модов из очереди.' });
    }
});

app.get('/mods', (req, res) => {
    const gameId = req.query.game || config.games[0].id;
    const gameMods = installedMods.filter(m => m.gameId === gameId);
    res.json({ installedMods: gameMods });
});

app.get('/import-mods', (req, res) => {
    const gameId = req.query.game || config.games[0].id;
    const gameMods = installedMods.filter(m => m.gameId === gameId);
    res.json({ installedMods: gameMods });
});

// Эндпоинт импорта модов из папки в очередь (изменён)
app.post('/queue-mods-folder', (req, res) => {
    try {
        const { importPath, game } = req.body;
        if (!importPath) {
            return res.status(400).json({ error: 'Не указан путь для импорта.' });
        }
        const gameId = game || config.games[0].id;
        const gameConfig = getGameConfig(gameId);
        const modFolders = fs.readdirSync(importPath, { withFileTypes: true })
            .filter(dirent => dirent.isDirectory())
            .map(dirent => path.join(importPath, dirent.name));
        const queuedImportedMods = [];
        modFolders.forEach(folder => {
            const modIdentifier = path.basename(folder);
            if (installedMods.find(m => m.modIdentifier === modIdentifier && m.gameId === gameId) ||
                queuedMods.find(m => m.modIdentifier === modIdentifier && m.gameId === gameId)) return;
            const files = fs.readdirSync(folder);
            let groFile, jpgFile, txtFile;
            files.forEach(file => {
                const lower = file.toLowerCase();
                if (lower.endsWith('.gro')) groFile = file;
                else if (lower.endsWith('.jpg')) jpgFile = file;
                else if (lower.endsWith('.txt')) txtFile = file;
            });
            if (!groFile || !jpgFile || !txtFile) return;
            const txtContent = fs.readFileSync(path.join(folder, txtFile), 'utf-8');
            const parts = txtContent.split('#').filter(Boolean);
            const title = parts[1] || 'Unknown Mod';
            const stats = fs.statSync(path.join(folder, groFile));
            const weight = stats.size;
            const uniqueFolder = path.join(tempFolder, Date.now().toString());
            fs.mkdirSync(uniqueFolder, { recursive: true });
            fs.cpSync(folder, uniqueFolder, { recursive: true });
            const iconURL = `/temp/${path.basename(uniqueFolder)}/${jpgFile}`;
            const queuedMod = {
                modIdentifier,
                title,
                weight,
                groFileName: groFile,
                tempGroPath: path.join(uniqueFolder, groFile),
                icon: iconURL,
                jpgFile: jpgFile,
                queueFolder: uniqueFolder,
                gameId,
                queuedAt: Date.now()
            };
            queuedMods.push(queuedMod);
            queuedImportedMods.push(queuedMod);
        });
        return res.json({ message: 'Моды добавлены в очередь.', queuedImportedMods, queuedMods });
    } catch (err) {
        console.error('Ошибка при импорте модов из папки в очередь:', err);
        return res.status(500).json({ error: 'Ошибка при импорте модов из папки в очередь.' });
    }
});

// Эндпоинт запуска игры
app.post('/launch-game', (req, res) => {
    try {
        const gameId = req.query.game || req.body.game || config.games[0].id;
        const mode = req.query.mode || req.body.mode || 'modded'; // 'modded' или 'vanilla'
        const gameConfig = getGameConfig(gameId);
        // Из config.json должно быть указано поле "gameExe"
        const gameExe = gameConfig.gameExe;
        if (!gameExe) {
            return res.status(400).json({ error: 'Не задан путь к игре (exe).' });
        }
        // Если режим vanilla, перемещаем установленные моды в disabled для данного gameId
        if (mode === 'vanilla') {
            const gameModsFolder = computeGamePaths(gameConfig).modsFolder;
            const disabledPath = path.join(disabledFolder, gameId);
            if (!fs.existsSync(disabledPath)) fs.mkdirSync(disabledPath, { recursive: true });
            installedMods.forEach(mod => {
                if (mod.gameId === gameId && mod.status === "enabled") {
                    const targetPath = path.join(disabledPath, path.basename(mod.groFile));
                    fs.renameSync(mod.groFile, targetPath);
                    mod.groFile = targetPath;
                    mod.status = "disabled";
                }
            });
            saveInstalledMods(installedMods);
        }
        // Запускаем игру через spawn
        const child = spawn(gameExe, [], { detached: true, stdio: 'ignore' });
        child.unref();
        return res.json({ message: 'Игра запущена в режиме ' + mode + '.' });
    } catch (err) {
        console.error('Ошибка при запуске игры:', err);
        return res.status(500).json({ error: 'Ошибка при запуске игры.' });
    }
});

app.post('/delete-mod', (req, res) => {
    try {
        const { modIdentifier, gameId } = req.body;
        const index = installedMods.findIndex(mod => mod.modIdentifier === modIdentifier && mod.gameId === gameId);
        if (index === -1) return res.status(404).json({ error: 'Мод не найден.' });
        const mod = installedMods[index];
        const filePath = mod.status === "enabled" ? mod.groFile : path.join(computeDisabledPath(gameId), path.basename(mod.groFile));
        if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
        installedMods.splice(index, 1);
        saveInstalledMods(installedMods);
        return res.json({ message: 'Мод удалён.', installedMods });
    } catch (err) {
        console.error('Ошибка при удалении мода:', err);
        return res.status(500).json({ error: 'Ошибка при удалении мода.' });
    }
});

app.post('/toggle-mod', (req, res) => {
    try {
        const { modIdentifier, gameId } = req.body;
        const mod = installedMods.find(m => m.modIdentifier === modIdentifier && m.gameId === gameId);
        if (!mod) return res.status(404).json({ error: 'Мод не найден.' });
        if (mod.status === "enabled") {
            const disabledPath = computeDisabledPath(gameId);
            if (!fs.existsSync(disabledPath)) fs.mkdirSync(disabledPath, { recursive: true });
            const newPath = path.join(disabledPath, path.basename(mod.groFile));
            fs.renameSync(mod.groFile, newPath);
            mod.groFile = newPath;
            mod.status = "disabled";
        } else {
            const gameConfig = getGameConfig(gameId);
            const { modsFolder } = computeGamePaths(gameConfig);
            const newPath = path.join(modsFolder, path.basename(mod.groFile));
            fs.renameSync(mod.groFile, newPath);
            mod.groFile = newPath;
            mod.status = "enabled";
        }
        saveInstalledMods(installedMods);
        return res.json({ message: 'Статус мода изменён.', mod, installedMods });
    } catch (err) {
        console.error('Ошибка при переключении статуса мода:', err);
        return res.status(500).json({ error: 'Ошибка при переключении статуса мода.' });
    }
});

app.get('/mods', (req, res) => {
    const gameId = req.query.game || config.games[0].id;
    const gameMods = installedMods.filter(m => m.gameId === gameId);
    res.json({ installedMods: gameMods });
});

app.get('/import-mods', (req, res) => {
    const gameId = req.query.game || config.games[0].id;
    const gameMods = installedMods.filter(m => m.gameId === gameId);
    res.json({ installedMods: gameMods });
});

const server = app.listen(PORT, () => {
    console.log(`Сервер запущен на http://localhost:${PORT}`);
});
function shutdown() {
    console.log('Завершаем работу сервера...');
    server.close(() => {
        console.log('Сервер успешно закрыт.');
        process.exit(0);
    });
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

module.exports = server;
