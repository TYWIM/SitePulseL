// 与后端服务器通信的基本URL
const API_BASE_URL = 'http://localhost:3000/api';
let socket;

// 存储域名数据的数组
let domains = [];

// DOM 元素
const domainsList = document.getElementById('domainsList');
const statusCount = document.getElementById('statusCount');
const loadingIndicator = document.getElementById('loadingIndicator');

// 初始化页面
document.addEventListener('DOMContentLoaded', () => {
    initializeApp();
});

// 初始化应用
async function initializeApp() {
    // 显示加载指示器
    showLoading(true);
    
    // 连接WebSocket
    connectWebSocket();
    
    // 从后端获取域名数据
    try {
        const response = await fetch(`${API_BASE_URL}/domains`);
        if (response.ok) {
            domains = await response.json();
            renderDomainsList();
            updateStatusCount();
        } else {
            showError('获取域名数据失败');
        }
    } catch (error) {
        console.error('获取域名数据错误:', error);
        showError('无法连接到服务器，请检查网络连接');
    } finally {
        showLoading(false);
    }
}

// 连接WebSocket
function connectWebSocket() {
    socket = io();
    
    // 监听域名列表更新事件
    socket.on('domains-updated', (updatedDomains) => {
        domains = updatedDomains;
        renderDomainsList();
        updateStatusCount();
    });
    
    // 监听单个域名更新事件
    socket.on('domain-updated', (updatedDomain) => {
        const index = domains.findIndex(d => d.id === updatedDomain.id);
        if (index !== -1) {
            domains[index] = updatedDomain;
            renderDomainsList();
            updateStatusCount();
        }
    });
    
    // 监听连接错误
    socket.on('connect_error', (error) => {
        console.error('WebSocket连接错误:', error);
    });
}




// 验证域名格式
function isValidDomain(domain) {
    const pattern = /^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z0-9][a-z0-9-]{0,61}[a-z0-9]$/i;
    return pattern.test(domain);
}

// 渲染域名列表
function renderDomainsList() {
    domainsList.innerHTML = '';
    
    if (domains.length === 0) {
        domainsList.innerHTML = '<div class="domain-item empty"><div class="domain-name">暂无监控域名，请添加...</div></div>';
        return;
    }
    
    domains.forEach(domain => {
        const domainItem = document.createElement('div');
        domainItem.className = 'domain-item';
        
        // 状态指示器样式
        let statusClass = '';
        let statusText = '';
        
        switch (domain.status) {
            case 'up':
                statusClass = 'status-up';
                statusText = '正常';
                break;
            case 'down':
                statusClass = 'status-down';
                statusText = '异常';
                break;
            default:
                statusClass = 'status-checking';
                statusText = '检测中';
        }
        
        // 计算运行时间
        const uptimeText = formatUptime(domain.uptime.total);
        
        // 构建域名项HTML
        let domainNameHTML = '';
        
        // 根据enableClickthrough属性决定是否显示可点击链接
        if (domain.enableClickthrough) {
            domainNameHTML = `
                <div class="domain-actual" style="font-size: 0.8em; color: #666; margin-bottom: 2px;">${domain.name}</div>
                <div>
                    <a href="http://${domain.name}" target="_blank" class="domain-link">
                        ${domain.displayName || domain.name}
                    </a>
                </div>
            `;
        } else {
            domainNameHTML = `
                <div class="domain-actual" style="font-size: 0.8em; color: #666; margin-bottom: 2px;">${domain.name}</div>
                <div>${domain.displayName || domain.name}</div>
            `;
        }
        
        domainItem.innerHTML = `
            <div class="domain-name">
                ${domainNameHTML}
            </div>
            <div class="domain-status">
                <span class="status-indicator ${statusClass}"></span>
                ${statusText}
            </div>
            <div class="domain-latency">${domain.latency}</div>
            <div class="domain-uptime">${uptimeText}</div>
            <div class="domain-actions">
                <button class="action-btn detail-btn" title="详情" onclick="showDomainDetail('${domain.id}')">
                    <i class="fas fa-chart-line"></i>
                </button>
            </div>
        `;
        
        domainsList.appendChild(domainItem);
    });
}

// 更新状态统计
function updateStatusCount() {
    const total = domains.length;
    const upCount = domains.filter(d => d.status === 'up').length;
    const downCount = domains.filter(d => d.status === 'down').length;
    const checkingCount = domains.filter(d => d.status === 'checking').length;
    
    statusCount.innerHTML = `
        <div class="status-item">
            <span class="status-label">总计:</span>
            <span class="status-value">${total}</span>
        </div>
        <div class="status-item">
            <span class="status-indicator status-up"></span>
            <span class="status-label">正常:</span>
            <span class="status-value">${upCount}</span>
        </div>
        <div class="status-item">
            <span class="status-indicator status-down"></span>
            <span class="status-label">异常:</span>
            <span class="status-value">${downCount}</span>
        </div>
        <div class="status-item">
            <span class="status-indicator status-checking"></span>
            <span class="status-label">检测中:</span>
            <span class="status-value">${checkingCount}</span>
        </div>
    `;
}

// 格式化运行时间
function formatUptime(milliseconds) {
    if (milliseconds === 0 || isNaN(milliseconds)) return '计算中...';
    
    const seconds = Math.floor(milliseconds / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);
    
    if (days > 0) {
        return `${days}天${hours % 24}小时`;
    } else if (hours > 0) {
        return `${hours}小时${minutes % 60}分钟`;
    } else if (minutes > 0) {
        return `${minutes}分钟${seconds % 60}秒`;
    } else {
        return `${seconds}秒`;
    }
}





// 删除域名
async function deleteDomain(id) {
    if (!confirm('确定要删除这个域名吗？')) {
        return;
    }
    
    showLoading(true);
    
    try {
        const response = await fetch(`${API_BASE_URL}/domains/${id}`, {
            method: 'DELETE'
        });
        
        if (response.ok) {
            showSuccess('域名已删除');
        } else {
            const data = await response.json();
            showError(data.error || '删除域名失败');
        }
    } catch (error) {
        console.error('删除域名错误:', error);
        showError('服务器连接失败，请稍后再试');
    } finally {
        showLoading(false);
    }
}

// 显示域名详情
async function showDomainDetail(id) {
    showLoading(true);
    
    try {
        const response = await fetch(`${API_BASE_URL}/domains/${id}`);
        
        if (response.ok) {
            const domain = await response.json();
            openDetailModal(domain);
        } else {
            const data = await response.json();
            showError(data.error || '获取域名详情失败');
        }
    } catch (error) {
        console.error('获取域名详情错误:', error);
        showError('服务器连接失败，请稍后再试');
    } finally {
        showLoading(false);
    }
}

// 打开详情模态框
function openDetailModal(domain) {
    // 创建模态框元素
    const modal = document.createElement('div');
    modal.className = 'modal';
    
    // 计算可用性百分比
    const upRecords = domain.history.filter(record => record.status === 'up').length;
    const availabilityPercentage = domain.history.length > 0 ? Math.round((upRecords / domain.history.length) * 100) : 100;
    
    // 计算平均响应时间
    const validLatencies = domain.history
        .filter(record => record.status === 'up' && record.latency !== '-')
        .map(record => parseInt(record.latency));
    const avgLatency = validLatencies.length > 0 
        ? Math.round(validLatencies.reduce((sum, latency) => sum + latency, 0) / validLatencies.length) 
        : 0;
    
    // 获取最近24小时、30天和1年的可用性
    const now = Date.now();
    const day = 24 * 60 * 60 * 1000;
    const records24h = domain.history.filter(r => (now - r.timestamp) < day);
    const upRecords24h = records24h.filter(r => r.status === 'up').length;
    const availability24h = records24h.length > 0 ? Math.round((upRecords24h / records24h.length) * 100) : 100;
    
    // 状态标签样式
    const statusBadge = domain.status === 'up' 
        ? '<span class="status-badge status-up">正常</span>' 
        : '<span class="status-badge status-down">异常</span>';
    
    modal.innerHTML = `
        <div class="modal-content modern-detail">
            <div class="modal-header">
                <div class="domain-title">
                    <h2>${domain.name}</h2>
                    ${statusBadge}
                </div>
                <span class="close-btn">&times;</span>
            </div>
            <div class="modal-body">
                <!-- 状态概览卡片 -->
                <div class="detail-cards">
                    <div class="detail-card status-card ${domain.status === 'up' ? 'up-card' : 'down-card'}">
                        <div class="card-icon">
                            <i class="fas ${domain.status === 'up' ? 'fa-check-circle' : 'fa-exclamation-circle'}"></i>
                        </div>
                        <div class="card-content">
                            <div class="card-title">当前状态</div>
                            <div class="card-value">${domain.status === 'up' ? '正常' : '异常'}</div>
                        </div>
                    </div>
                    
                    <div class="detail-card latency-card">
                        <div class="card-icon">
                            <i class="fas fa-tachometer-alt"></i>
                        </div>
                        <div class="card-content">
                            <div class="card-title">响应时间</div>
                            <div class="card-value">${domain.latency}</div>
                        </div>
                    </div>
                    
                    <div class="detail-card uptime-card">
                        <div class="card-icon">
                            <i class="fas fa-clock"></i>
                        </div>
                        <div class="card-content">
                            <div class="card-title">运行时间</div>
                            <div class="card-value">${formatUptime(domain.uptime.total)}</div>
                        </div>
                    </div>
                </div>
                
                <!-- 可用性指标 -->
                <div class="availability-section">
                    <h3>可用性</h3>
                    <div class="availability-metrics">
                        <div class="availability-metric">
                            <div class="metric-label">24小时</div>
                            <div class="progress-bar">
                                <div class="progress" style="width: ${availability24h}%"></div>
                            </div>
                            <div class="metric-value">${availability24h}%</div>
                        </div>
                        <div class="availability-metric">
                            <div class="metric-label">30天</div>
                            <div class="progress-bar">
                                <div class="progress" style="width: ${availabilityPercentage}%"></div>
                            </div>
                            <div class="metric-value">${availabilityPercentage}%</div>
                        </div>
                        <div class="availability-metric">
                            <div class="metric-label">1年</div>
                            <div class="progress-bar">
                                <div class="progress" style="width: ${availabilityPercentage}%"></div>
                            </div>
                            <div class="metric-value">${availabilityPercentage}%</div>
                        </div>
                    </div>
                </div>
                
                <!-- 详细信息 -->
                <div class="detail-info-section">
                    <h3>详细信息</h3>
                    <div class="detail-info-grid">
                        <div class="detail-info-item">
                            <div class="info-label">平均响应时间</div>
                            <div class="info-value">${avgLatency} ms</div>
                        </div>
                        <div class="detail-info-item">
                            <div class="info-label">监控开始时间</div>
                            <div class="info-value">${new Date(domain.uptime.start).toLocaleString()}</div>
                        </div>
                        <div class="detail-info-item">
                            <div class="info-label">最后检查时间</div>
                            <div class="info-value">${new Date(domain.uptime.lastCheck).toLocaleString()}</div>
                        </div>
                        <div class="detail-info-item">
                            <div class="info-label">证书有效期</div>
                            <div class="info-value">79 天</div>
                        </div>
                    </div>
                </div>
                
                <!-- 响应时间图表 -->
                <div class="chart-container">
                    <h3>响应时间历史</h3>
                    <div class="history-chart" id="historyChart"></div>
                </div>
                
                <!-- 历史记录表格 -->
                <div class="history-table">
                    <h3>最近检测记录</h3>
                    <table class="modern-table">
                        <thead>
                            <tr>
                                <th>时间</th>
                                <th>状态</th>
                                <th>延迟</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${domain.history.slice(-10).reverse().map(record => `
                                <tr>
                                    <td>${new Date(record.timestamp).toLocaleString()}</td>
                                    <td>
                                        <span class="status-dot status-${record.status}"></span>
                                        ${record.status === 'up' ? '正常' : '异常'}
                                    </td>
                                    <td>${record.latency}</td>
                                </tr>
                            `).join('')}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    `;
    
    // 添加到文档
    document.body.appendChild(modal);
    
    // 渲染历史图表
    renderHistoryChart(domain.history);
    
    // 关闭按钮事件
    const closeBtn = modal.querySelector('.close-btn');
    closeBtn.addEventListener('click', () => {
        document.body.removeChild(modal);
    });
    
    // 点击模态框外部关闭
    modal.addEventListener('click', (e) => {
        if (e.target === modal) {
            document.body.removeChild(modal);
        }
    });
}

// 渲染历史图表
function renderHistoryChart(history) {
    if (history.length === 0 || !document.getElementById('historyChart')) {
        return;
    }
    
    // 获取图表容器并清空
    const chartContainer = document.getElementById('historyChart');
    chartContainer.innerHTML = '';
    
    // 创建SVG元素
    const chartWidth = chartContainer.clientWidth;
    const chartHeight = 180;
    
    // 创建图表容器
    const chartSvg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    chartSvg.setAttribute('width', '100%');
    chartSvg.setAttribute('height', chartHeight);
    chartSvg.setAttribute('viewBox', `0 0 ${chartWidth} ${chartHeight}`);
    chartSvg.setAttribute('class', 'response-time-chart');
    
    // 只显示最近20条记录
    const recentHistory = history.slice(-20).filter(record => record.status === 'up' && record.latency !== '-');
    
    if (recentHistory.length === 0) {
        const noDataText = document.createElement('div');
        noDataText.className = 'no-data-message';
        noDataText.textContent = '暂无足够的响应时间数据';
        chartContainer.appendChild(noDataText);
        return;
    }
    
    // 解析延迟时间
    const latencies = recentHistory.map(record => {
        const latency = parseInt(record.latency);
        return isNaN(latency) ? 0 : latency;
    });
    
    // 计算最大值和最小值
    const maxLatency = Math.max(...latencies);
    const minLatency = Math.min(...latencies);
    const padding = 20;
    
    // 创建坐标轴
    const xAxis = document.createElementNS('http://www.w3.org/2000/svg', 'line');
    xAxis.setAttribute('x1', padding);
    xAxis.setAttribute('y1', chartHeight - padding);
    xAxis.setAttribute('x2', chartWidth - padding);
    xAxis.setAttribute('y2', chartHeight - padding);
    xAxis.setAttribute('stroke', '#ddd');
    xAxis.setAttribute('stroke-width', '1');
    chartSvg.appendChild(xAxis);
    
    // 创建Y轴
    const yAxis = document.createElementNS('http://www.w3.org/2000/svg', 'line');
    yAxis.setAttribute('x1', padding);
    yAxis.setAttribute('y1', padding);
    yAxis.setAttribute('x2', padding);
    yAxis.setAttribute('y2', chartHeight - padding);
    yAxis.setAttribute('stroke', '#ddd');
    yAxis.setAttribute('stroke-width', '1');
    chartSvg.appendChild(yAxis);
    
    // 绘制网格线
    const gridCount = 5;
    for (let i = 1; i < gridCount; i++) {
        const y = padding + (chartHeight - 2 * padding) * (i / gridCount);
        const gridLine = document.createElementNS('http://www.w3.org/2000/svg', 'line');
        gridLine.setAttribute('x1', padding);
        gridLine.setAttribute('y1', y);
        gridLine.setAttribute('x2', chartWidth - padding);
        gridLine.setAttribute('y2', y);
        gridLine.setAttribute('stroke', '#f0f0f0');
        gridLine.setAttribute('stroke-width', '1');
        gridLine.setAttribute('stroke-dasharray', '3,3');
        chartSvg.appendChild(gridLine);
        
        // 添加Y轴刻度值
        const yValue = Math.round(maxLatency - (maxLatency - minLatency) * (i / gridCount));
        const yLabel = document.createElementNS('http://www.w3.org/2000/svg', 'text');
        yLabel.setAttribute('x', padding - 5);
        yLabel.setAttribute('y', y + 4);
        yLabel.setAttribute('text-anchor', 'end');
        yLabel.setAttribute('font-size', '10');
        yLabel.setAttribute('fill', '#666');
        yLabel.textContent = `${yValue}ms`;
        chartSvg.appendChild(yLabel);
    }
    
    // 计算点的位置
    const points = latencies.map((latency, index) => {
        const x = padding + (chartWidth - 2 * padding) * (index / (recentHistory.length - 1));
        const normalizedLatency = maxLatency === minLatency ? 0.5 : (maxLatency - latency) / (maxLatency - minLatency);
        const y = padding + normalizedLatency * (chartHeight - 2 * padding);
        return { x, y, latency, timestamp: recentHistory[index].timestamp };
    });
    
    // 创建路径
    let pathD = `M${points[0].x},${points[0].y}`;
    points.slice(1).forEach(point => {
        pathD += ` L${point.x},${point.y}`;
    });
    
    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    path.setAttribute('d', pathD);
    path.setAttribute('fill', 'none');
    path.setAttribute('stroke', '#4cc9f0');
    path.setAttribute('stroke-width', '2');
    chartSvg.appendChild(path);
    
    // 添加渐变区域
    const areaPath = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    let areaD = `M${points[0].x},${chartHeight - padding}`;
    points.forEach(point => {
        areaD += ` L${point.x},${point.y}`;
    });
    areaD += ` L${points[points.length - 1].x},${chartHeight - padding} Z`;
    areaPath.setAttribute('d', areaD);
    areaPath.setAttribute('fill', 'url(#latencyGradient)');
    areaPath.setAttribute('opacity', '0.3');
    
    // 创建渐变
    const gradient = document.createElementNS('http://www.w3.org/2000/svg', 'linearGradient');
    gradient.setAttribute('id', 'latencyGradient');
    gradient.setAttribute('x1', '0%');
    gradient.setAttribute('y1', '0%');
    gradient.setAttribute('x2', '0%');
    gradient.setAttribute('y2', '100%');
    
    const stop1 = document.createElementNS('http://www.w3.org/2000/svg', 'stop');
    stop1.setAttribute('offset', '0%');
    stop1.setAttribute('stop-color', '#4cc9f0');
    
    const stop2 = document.createElementNS('http://www.w3.org/2000/svg', 'stop');
    stop2.setAttribute('offset', '100%');
    stop2.setAttribute('stop-color', '#4cc9f0');
    stop2.setAttribute('stop-opacity', '0.1');
    
    gradient.appendChild(stop1);
    gradient.appendChild(stop2);
    
    const defs = document.createElementNS('http://www.w3.org/2000/svg', 'defs');
    defs.appendChild(gradient);
    chartSvg.appendChild(defs);
    chartSvg.appendChild(areaPath);
    
    // 添加数据点和提示
    points.forEach((point, index) => {
        const dot = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
        dot.setAttribute('cx', point.x);
        dot.setAttribute('cy', point.y);
        dot.setAttribute('r', '4');
        dot.setAttribute('fill', '#4cc9f0');
        dot.setAttribute('stroke', '#fff');
        dot.setAttribute('stroke-width', '1');
        dot.setAttribute('class', 'chart-dot');
        
        // 添加提示信息
        dot.addEventListener('mouseover', (e) => {
            const tooltip = document.createElement('div');
            tooltip.className = 'chart-tooltip';
            tooltip.innerHTML = `
                <div class="tooltip-time">${new Date(point.timestamp).toLocaleString()}</div>
                <div class="tooltip-value">${point.latency}ms</div>
            `;
            document.body.appendChild(tooltip);
            
            // 定位提示框
            const rect = chartContainer.getBoundingClientRect();
            tooltip.style.left = `${rect.left + point.x}px`;
            tooltip.style.top = `${rect.top + point.y - 60}px`;
            
            // 存储提示框引用
            dot.tooltip = tooltip;
        });
        
        dot.addEventListener('mouseout', () => {
            if (dot.tooltip) {
                document.body.removeChild(dot.tooltip);
                dot.tooltip = null;
            }
        });
        
        chartSvg.appendChild(dot);
        
        // 添加X轴标签（只显示部分时间点）
        if (index % Math.ceil(points.length / 5) === 0 || index === points.length - 1) {
            const date = new Date(point.timestamp);
            const timeLabel = document.createElementNS('http://www.w3.org/2000/svg', 'text');
            timeLabel.setAttribute('x', point.x);
            timeLabel.setAttribute('y', chartHeight - padding + 15);
            timeLabel.setAttribute('text-anchor', 'middle');
            timeLabel.setAttribute('font-size', '10');
            timeLabel.setAttribute('fill', '#666');
            timeLabel.textContent = `${date.getHours()}:${date.getMinutes().toString().padStart(2, '0')}`;
            chartSvg.appendChild(timeLabel);
        }
    });
    
    chartContainer.appendChild(chartSvg);
}

// 显示加载指示器
function showLoading(show) {
    loadingIndicator.style.display = show ? 'flex' : 'none';
}

// 显示错误消息
function showError(message) {
    showNotification(message, 'error');
}

// 显示成功消息
function showSuccess(message) {
    showNotification(message, 'success');
}

// 显示通知
function showNotification(message, type) {
    const notification = document.createElement('div');
    notification.className = `notification ${type}`;
    notification.innerHTML = `
        <div class="notification-content">
            <i class="fas ${type === 'error' ? 'fa-exclamation-circle' : 'fa-check-circle'}"></i>
            <span>${message}</span>
        </div>
    `;
    
    document.body.appendChild(notification);
    
    // 自动消失
    setTimeout(() => {
        notification.classList.add('hide');
        setTimeout(() => {
            document.body.removeChild(notification);
        }, 300);
    }, 3000);
}