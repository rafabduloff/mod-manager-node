const { app, BrowserWindow } = require('electron');
const path = require('path');
const server = require('./server');

let mainWindow;

function createWindow() {
    mainWindow = new BrowserWindow({
        width: 1200,
        height: 800,
        webPreferences: {
            nodeIntegration: true,
            contextIsolation: false,
        }
    });
    mainWindow.loadFile(path.join(__dirname, 'public', 'index.html'));
    mainWindow.on('closed', () => {
        mainWindow = null;
    });
}

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
        app.quit();
    }
});

app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
});

app.on('quit', () => {
    if (server && server.close) {
        server.close(() => {
            console.log('Сервер закрыт при завершении работы приложения.');
        });
    }
});
