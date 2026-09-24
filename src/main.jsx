import React from 'react'
import { createRoot } from 'react-dom/client'
import App from './App.jsx'
import './styles/global.css'

// 刻意不用 StrictMode：游戏状态机有副作用，双调用会导致重复推进
createRoot(document.getElementById('root')).render(<App />)
