const express = require('express');
const cors = require('cors');
const axios = require('axios');
const path = require('path');
const cron = require('node-cron');
const http = require('http');
const { Server } = require('socket.io');
const fs = require('fs');

// 创建Express应用
const app = express();
const server = http.createServer(app);
const io = new Server(server);

// 中间件
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, '/')));

// 数据存储路径
const DATA_FILE = path.join(__dirname, 'domains.json');

// 读取域名数据
function readDomainsData() {
  try {
    if (fs.existsSync(DATA_FILE)) {
      const data = fs.readFileSync(DATA_FILE, 'utf8');
      return JSON.parse(data);
    }
    return [];
  } catch (error) {
    console.error('读取域名数据失败:', error);
    return [];
  }
}

// 保存域名数据
function saveDomainsData(domains) {
  try {
    fs.writeFileSync(DATA_FILE, JSON.stringify(domains, null, 2));
    return true;
  } catch (error) {
    console.error('保存域名数据失败:', error);
    return false;
  }
}

// 检查域名状态
async function checkDomainStatus(domain) {
  const startTime = Date.now();
  const url = `https://${domain.name}`;
  
  try {
    const response = await axios.get(url, {
      timeout: 10000, // 10秒超时
      validateStatus: () => true // 接受任何状态码
    });
    
    const latency = Date.now() - startTime;
    return {
      status: 'up',
      latency: `${latency}ms`,
      statusCode: response.status
    };
  } catch (error) {
    return {
      status: 'down',
      latency: '-',
      error: error.message
    };
  }
}

// 更新域名状态
async function updateDomainStatus(domain, forceCheck = false) { // Added forceCheck for manual refresh
  // 如果不是强制检查，并且设置了检查间隔，则判断是否到达检查时间
  if (!forceCheck && domain.checkInterval && domain.lastChecked) {
    const now = Date.now();
    const timeSinceLastCheck = now - domain.lastChecked;
    if (timeSinceLastCheck < domain.checkInterval * 60 * 1000) {
      // console.log(`域名 ${domain.name} 未到检查时间，跳过。`);
      return domain; // 未到检查时间，不执行检查，直接返回原状态
    }
  }

  const result = await checkDomainStatus(domain);
  const now = Date.now();
  
  // 更新状态和延迟
  domain.status = result.status;
  domain.latency = result.latency;
  domain.lastChecked = now;
  
  // 更新运行时间计算
  if (result.status === 'up') {
    // 如果之前也是正常状态，累加运行时间
    if (domain.uptime.lastCheck) {
      domain.uptime.total += (now - domain.uptime.lastCheck);
    }
  }
  
  // 更新最后检查时间
  domain.uptime.lastCheck = now;
  
  // 添加到历史记录
  domain.history.push({
    timestamp: now,
    status: result.status,
    latency: result.latency,
    statusCode: result.statusCode
  });
  
  // 限制历史记录长度
  if (domain.history.length > 100) {
    domain.history = domain.history.slice(-100);
  }
  
  return domain;
}

// API路由
// 获取所有域名
app.get('/api/domains', (req, res) => {
  const domains = readDomainsData();
  res.json(domains);
});

// 添加新域名 - 仅限管理后台使用
app.post('/api/domains', async (req, res) => {
  const { name, displayName, checkInterval, enableClickthrough, enableNotifications } = req.body;
  
  // 检查请求来源 - 仅允许管理后台添加域名
  const referer = req.headers.referer || '';
  if (!referer.includes('/admin.html')) {
    return res.status(403).json({ error: '权限不足，域名管理仅可在后台进行' });
  }
  
  if (!name) {
    return res.status(400).json({ error: '域名不能为空' });
  }
  
  // 验证域名格式
  const pattern = /^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z0-9][a-z0-9-]{0,61}[a-z0-9]$/i;
  if (!pattern.test(name)) {
    return res.status(400).json({ error: '域名格式无效' });
  }
  
  const domains = readDomainsData();
  
  // 检查域名是否已存在
  if (domains.some(domain => domain.name === name)) {
    return res.status(400).json({ error: '该域名已在监控列表中' });
  }
  
  // 创建新域名对象
  const newDomain = {
    id: Date.now().toString(),
    name,
    displayName: displayName || name, // 如果没有提供显示名称，则默认为域名本身
    checkInterval: parseInt(checkInterval) || 5, // 默认5分钟
    enableClickthrough: enableClickthrough === undefined ? true : enableClickthrough, // 默认允许点击
    enableNotifications: enableNotifications === undefined ? true : enableNotifications, // 默认启用通知
    status: 'checking', // 初始状态
    latency: '-',
    lastChecked: null, // 上次检查时间
    uptime: {
      start: Date.now(),
      total: 0,
      lastCheck: null // 修改为null，首次检查后更新
    },
    history: []
  };
  
  // 立即检查新域名状态
  const updatedDomain = await updateDomainStatus(newDomain);
  
  // 添加到数组并保存
  domains.push(updatedDomain);
  saveDomainsData(domains);
  
  // 通知所有客户端域名列表已更新 (可以考虑只发送新增的域名，或让前端重新拉取)
  io.emit('domainUpdate', updatedDomain); // 发送单个域名更新事件，与admin.js对应
  // io.emit('domains-updated', readDomainsData()); // 或者发送完整列表，确保数据一致性
  
  res.status(201).json(updatedDomain);
});

// 删除域名 - 仅限管理后台使用
app.delete('/api/domains/:id', (req, res) => {
  // 检查请求来源 - 仅允许管理后台删除域名
  const referer = req.headers.referer || '';
  if (!referer.includes('/admin.html')) {
    return res.status(403).json({ error: '权限不足，域名管理仅可在后台进行' });
  }
  
  const { id } = req.params;
  let domains = readDomainsData();
  
  const initialLength = domains.length;
  domains = domains.filter(domain => domain.id !== id);
  
  if (domains.length === initialLength) {
    return res.status(404).json({ error: '域名不存在' });
  }
  
  saveDomainsData(domains);
  
  // 通知所有客户端域名列表已更新
  io.emit('domains-updated', domains); // 发送更新后的域名列表
  
  res.json({ message: '域名已删除' });
});

// 更新域名 (PUT)
app.put('/api/domains/:id', async (req, res) => {
  const { id } = req.params;
  const { name, displayName, checkInterval, enableClickthrough, enableNotifications } = req.body;

  if (!name) {
    return res.status(400).json({ error: '域名不能为空' });
  }

  const domains = readDomainsData();
  const domainIndex = domains.findIndex(d => d.id === id);

  if (domainIndex === -1) {
    return res.status(404).json({ error: '域名不存在' });
  }

  // 更新域名信息
  domains[domainIndex] = {
    ...domains[domainIndex], // 保留原有信息，如status, latency, history等
    name: name,
    displayName: displayName || name,
    checkInterval: parseInt(checkInterval) || 5,
    enableClickthrough: enableClickthrough === undefined ? true : enableClickthrough,
    enableNotifications: enableNotifications === undefined ? true : enableNotifications,
    // lastChecked 和 uptime 等状态相关信息会在 updateDomainStatus 中更新
  };

  // 立即重新检查状态，因为配置可能已更改
  domains[domainIndex] = await updateDomainStatus(domains[domainIndex], true); 

  saveDomainsData(domains);
  io.emit('domainUpdate', domains[domainIndex]); // 通知客户端更新
  res.json(domains[domainIndex]);
});

// 刷新单个域名
app.post('/api/domains/:id/refresh', async (req, res) => {
  const { id } = req.params;
  const domains = readDomainsData();
  
  const domainIndex = domains.findIndex(domain => domain.id === id);
  if (domainIndex === -1) {
    return res.status(404).json({ error: '域名不存在' });
  }
  
  // 更新域名状态 (强制检查)
  domains[domainIndex] = await updateDomainStatus(domains[domainIndex], true);
  saveDomainsData(domains);
  
  // 通知所有客户端
  io.emit('domainUpdate', domains[domainIndex]);
  
  res.json(domains[domainIndex]);
});

// 获取单个域名详情
app.get('/api/domains/:id', (req, res) => {
  const { id } = req.params;
  const domains = readDomainsData();
  
  const domain = domains.find(domain => domain.id === id);
  if (!domain) {
    return res.status(404).json({ error: '域名不存在' });
  }
  
  res.json(domain);
});

// WebSocket连接
io.on('connection', (socket) => {
  console.log('客户端已连接:', socket.id);
  
  // 发送当前域名列表给新连接的客户端
  const domains = readDomainsData();
  // 发送完整域名列表
  socket.emit('domains-updated', domains);
  // 同时为每个域名单独发送一次更新事件，确保与前端事件处理一致
  domains.forEach(domain => {
    socket.emit('domainUpdate', domain);
  });
  
  socket.on('disconnect', () => {
    console.log('客户端已断开连接:', socket.id);
  });
});

// 定时任务 - 每分钟检查所有域名 (现在会根据各自的checkInterval)
cron.schedule('* * * * *', async () => { // 每分钟运行一次，检查哪些域名需要更新
  console.log('执行定时检查任务...');
  const domains = readDomainsData();
  
  if (domains.length === 0) return;
  
  let updatedOccurred = false;
  const now = Date.now();

  for (let i = 0; i < domains.length; i++) {
    const domain = domains[i];
    // updateDomainStatus 内部会判断是否到达检查时间
    const originalStatus = domain.status;
    const updatedDomain = await updateDomainStatus(domain);

    if (updatedDomain.lastChecked === now || updatedDomain.status !== originalStatus) { // 检查是否实际进行了检查或状态发生变化
        domains[i] = updatedDomain;
        updatedOccurred = true;
        io.emit('domainUpdate', updatedDomain); // 实时通知客户端单个域名更新
    }
  }
  
  if (updatedOccurred) {
    saveDomainsData(domains);
    // console.log('部分域名状态已更新并保存。');
  }
});

// 启动服务器
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`服务器运行在 http://localhost:${PORT}`);
});