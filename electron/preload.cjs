const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('ownly', {
  platform: process.platform,
  isDesktop: true,
  minimize: () => ipcRenderer.send('win:minimize'),
  toggleMaximize: () => ipcRenderer.send('win:toggle-maximize'),
  close: () => ipcRenderer.send('win:close'),
  isMaximized: () => ipcRenderer.invoke('win:is-maximized'),
  onWindowState: (callback) => {
    const handler = (_event, state) => callback(state)
    ipcRenderer.on('win:state', handler)
    return () => ipcRenderer.removeListener('win:state', handler)
  },
  appInfo: () => ipcRenderer.invoke('app:info'),
  openExternal: (url) => ipcRenderer.invoke('app:open-external', url),
  ytSearch: (query, limit) => ipcRenderer.invoke('yt:search', query, limit),
  ytStream: (videoId) => ipcRenderer.invoke('yt:stream', videoId),
  ytAvailable: () => ipcRenderer.invoke('yt:available'),
  ytPlaylist: (url) => ipcRenderer.invoke('yt:playlist', url),
  netJson: (url) => ipcRenderer.invoke('net:json', url),
  spotifyPlaylist: (payload) => ipcRenderer.invoke('spotify:playlist', payload),
  discordStatus: () => ipcRenderer.invoke('discord:status'),
  discordConfigure: (options) => ipcRenderer.invoke('discord:configure', options),
  discordActivity: (activity) => ipcRenderer.invoke('discord:activity', activity),
  onDiscordStatus: (callback) => {
    const handler = (_event, status) => callback(status)
    ipcRenderer.on('discord:status', handler)
    return () => ipcRenderer.removeListener('discord:status', handler)
  },
})
