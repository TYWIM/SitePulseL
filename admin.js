// 后台管理页面的 JavaScript 逻辑

document.addEventListener('DOMContentLoaded', () => {
    const domainForm = document.getElementById('domainForm');
    const domainTableBody = document.getElementById('domainTableBody');
    const editModal = document.getElementById('editModal');
    const editDomainForm = document.getElementById('editDomainForm');
    const closeModal = document.querySelector('.close-modal');
    const cancelEditButton = document.getElementById('cancelEdit');
    const loadingIndicator = document.getElementById('loadingIndicator');
    const notification = document.getElementById('notification');
    const notificationContent = notification.querySelector('.notification-content');
    const notificationIcon = notification.querySelector('.notification-icon');
    const notificationMessage = notification.querySelector('.notification-message');

    const API_BASE_URL = ''; // 使用相对路径，这样在任何环境下都能正常工作

    // 显示加载指示器
    function showLoading() {
        if (loadingIndicator) loadingIndicator.style.display = 'flex';
    }

    // 隐藏加载指示器
    function hideLoading() {
        if (loadingIndicator) loadingIndicator.style.display = 'none';
    }

    // 显示通知
    function showNotification(message, type = 'success') {
        if (!notification || !notificationContent || !notificationIcon || !notificationMessage) return;

        notificationMessage.textContent = message;
        notificationContent.className = 'notification-content'; // Reset classes
        notificationIcon.className = 'notification-icon fas'; // Reset classes

        if (type === 'success') {
            notificationContent.classList.add('notification-success');
            notificationIcon.classList.add('fa-check-circle');
        } else if (type === 'error') {
            notificationContent.classList.add('notification-error');
            notificationIcon.classList.add('fa-times-circle');
        } else {
            notificationIcon.classList.add('fa-info-circle'); // Default icon
        }

        notification.style.display = 'block';
        setTimeout(() => {
            notification.style.display = 'none';
        }, 3000);
    }

    // 获取所有域名并渲染表格
    async function fetchAndRenderDomains() {
        showLoading();
        try {
            const response = await fetch(`${API_BASE_URL}/api/domains`);
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            const domains = await response.json();
            renderDomainTable(domains);
        } catch (error) {
            console.error('获取域名列表失败:', error);
            showNotification('获取域名列表失败，请查看控制台获取更多信息。', 'error');
        } finally {
            hideLoading();
        }
    }

    // 渲染域名表格
    function renderDomainTable(domains) {
        if (!domainTableBody) return;
        domainTableBody.innerHTML = ''; // 清空现有行

        if (!domains || domains.length === 0) {
            const row = domainTableBody.insertRow();
            const cell = row.insertCell();
            cell.colSpan = 7; // 根据表格列数调整
            cell.textContent = '暂无域名数据';
            cell.style.textAlign = 'center';
            return;
        }

        domains.forEach(domain => {
            const row = domainTableBody.insertRow();
            row.insertCell().textContent = domain.displayName || domain.name;
            row.insertCell().textContent = domain.name;
            row.insertCell().textContent = `${domain.checkInterval || 5} 分钟`;
            row.insertCell().textContent = domain.enableClickthrough === false ? '否' : '是';
            row.insertCell().textContent = domain.enableNotifications === false ? '否' : '是';
            
            const statusCell = row.insertCell();
            const statusBadge = document.createElement('span');
            statusBadge.classList.add('status-badge');
            if (domain.status === 'up') {
                statusBadge.classList.add('status-up');
                statusBadge.textContent = '正常';
            } else if (domain.status === 'down') {
                statusBadge.classList.add('status-down');
                statusBadge.textContent = '异常';
            } else {
                statusBadge.classList.add('status-unknown');
                statusBadge.textContent = '未知';
            }
            statusCell.appendChild(statusBadge);

            const actionsCell = row.insertCell();
            actionsCell.classList.add('domain-actions');

            const editButton = document.createElement('button');
            editButton.classList.add('action-btn', 'edit-btn');
            editButton.innerHTML = '<i class="fas fa-edit"></i> 编辑';
            editButton.onclick = () => openEditModal(domain);
            actionsCell.appendChild(editButton);

            const deleteButton = document.createElement('button');
            deleteButton.classList.add('action-btn', 'delete-btn');
            deleteButton.innerHTML = '<i class="fas fa-trash"></i> 删除';
            deleteButton.onclick = () => deleteDomain(domain.id || domain.name); // Assuming id is available, fallback to name
            actionsCell.appendChild(deleteButton);
        });
    }

    // 处理域名表单提交 (添加新域名)
    if (domainForm) {
        domainForm.addEventListener('submit', async (event) => {
            event.preventDefault();
            showLoading();
            const domainName = document.getElementById('domainName').value.trim();
            const displayName = document.getElementById('displayName').value.trim();
            const checkInterval = parseInt(document.getElementById('checkInterval').value);
            const enableClickthrough = document.getElementById('enableClickthrough').checked;
            const enableNotifications = document.getElementById('enableNotifications').checked;

            if (!domainName) {
                showNotification('域名地址不能为空。', 'error');
                hideLoading();
                return;
            }

            try {
                const response = await fetch(`${API_BASE_URL}/api/domains`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify({ 
                        name: domainName, 
                        displayName: displayName || domainName, 
                        checkInterval,
                        enableClickthrough,
                        enableNotifications
                    }),
                });
                if (!response.ok) {
                    const errorData = await response.json().catch(() => ({ message: '未知错误' }));
                    throw new Error(errorData.message || `HTTP error! status: ${response.status}`);
                }
                showNotification('域名添加成功！', 'success');
                domainForm.reset();
                fetchAndRenderDomains(); // 重新加载列表
            } catch (error) {
                console.error('添加域名失败:', error);
                showNotification(`添加域名失败: ${error.message}`, 'error');
            } finally {
                hideLoading();
            }
        });
    }

    // 打开编辑模态框并填充数据
    function openEditModal(domain) {
        if (!editModal || !editDomainForm) return;
        document.getElementById('editDomainId').value = domain.id || domain.name; // Assuming id is available
        document.getElementById('editDomainName').value = domain.name;
        document.getElementById('editDisplayName').value = domain.displayName || '';
        document.getElementById('editCheckInterval').value = domain.checkInterval || 5;
        document.getElementById('editEnableClickthrough').checked = domain.enableClickthrough !== false;
        document.getElementById('editEnableNotifications').checked = domain.enableNotifications !== false;
        editModal.style.display = 'block';
    }

    // 关闭编辑模态框
    function closeEditModal() {
        if (editModal) editModal.style.display = 'none';
    }

    if (closeModal) closeModal.onclick = closeEditModal;
    if (cancelEditButton) cancelEditButton.onclick = closeEditModal;
    window.onclick = (event) => {
        if (event.target === editModal) {
            closeEditModal();
        }
    };

    // 处理编辑域名表单提交
    if (editDomainForm) {
        editDomainForm.addEventListener('submit', async (event) => {
            event.preventDefault();
            showLoading();
            const domainId = document.getElementById('editDomainId').value;
            const domainName = document.getElementById('editDomainName').value.trim();
            const displayName = document.getElementById('editDisplayName').value.trim();
            const checkInterval = parseInt(document.getElementById('editCheckInterval').value);
            const enableClickthrough = document.getElementById('editEnableClickthrough').checked;
            const enableNotifications = document.getElementById('editEnableNotifications').checked;

            if (!domainName) {
                showNotification('域名地址不能为空。', 'error');
                hideLoading();
                return;
            }

            try {
                const response = await fetch(`${API_BASE_URL}/api/domains/${encodeURIComponent(domainId)}`, {
                    method: 'PUT',
                    headers: {
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify({ 
                        name: domainName, 
                        displayName: displayName || domainName, 
                        checkInterval,
                        enableClickthrough,
                        enableNotifications
                     }),
                });
                if (!response.ok) {
                    const errorData = await response.json().catch(() => ({ message: '未知错误' }));
                    throw new Error(errorData.message || `HTTP error! status: ${response.status}`);
                }
                showNotification('域名更新成功！', 'success');
                closeEditModal();
                fetchAndRenderDomains(); // 重新加载列表
            } catch (error) {
                console.error('更新域名失败:', error);
                showNotification(`更新域名失败: ${error.message}`, 'error');
            } finally {
                hideLoading();
            }
        });
    }

    // 删除域名
    async function deleteDomain(domainId) {
        if (!confirm(`确定要删除域名 ${domainId} 吗？`)) {
            return;
        }
        showLoading();
        try {
            const response = await fetch(`${API_BASE_URL}/api/domains/${encodeURIComponent(domainId)}`, {
                method: 'DELETE',
            });
            if (!response.ok) {
                const errorData = await response.json().catch(() => ({ message: '未知错误' }));
                throw new Error(errorData.message || `HTTP error! status: ${response.status}`);
            }
            showNotification('域名删除成功！', 'success');
            fetchAndRenderDomains(); // 重新加载列表
        } catch (error) {
            console.error('删除域名失败:', error);
            showNotification(`删除域名失败: ${error.message}`, 'error');
        } finally {
            hideLoading();
        }
    }

    // 初始化：获取并渲染域名列表
    fetchAndRenderDomains();

    // Socket.IO 客户端逻辑 (如果需要实时更新状态)
    const socket = io();

    socket.on('connect', () => {
        console.log('已连接到 Socket.IO 服务器');
    });

    socket.on('domainUpdate', (updatedDomain) => {
        console.log('收到域名更新:', updatedDomain);
        // 找到表格中的对应行并更新，或者重新渲染整个表格
        // 这是一个简化的示例，实际应用中可能需要更精确的更新逻辑
        fetchAndRenderDomains(); 
        showNotification(`域名 ${updatedDomain.name} 状态已更新。`, 'info');
    });

    socket.on('disconnect', () => {
        console.log('与 Socket.IO 服务器断开连接');
    });

    socket.on('connect_error', (err) => {
        console.error('Socket.IO 连接错误:', err);
    });

});