'use strict';
'require view';
'require fs';
'require ui';
'require network';

async function getNetworkInterfaces() {
    try {
        const interfaces = await network.getDevices();
        const result = [];

        interfaces.forEach(function(iface) {
            if (iface.getName() && iface.getType() !== 'bridge' && iface.isUp()) {
                const name = iface.getName();
                let category = 'other';
                let icon = '🔗';

                if (name.match(/^(eth|lan|br|bridge|switch|bond|team)/)) {
                    category = 'ethernet';
                    icon = '🌐';
                } else if (name.match(/^(wlan|wifi|ath|phy|ra|mt|rtl|iwl)/)) {
                    category = 'wifi';
                    icon = '📶';
                } else if (name.match(/^(wan|ppp|modem|3g|4g|5g|lte|gsm|cdma|hsdpa|hsupa|umts)/)) {
                    category = 'wan';
                    icon = '🌍';
                } else if (name.match(/^(tun|tap|vpn|wg|nord|express|surf|pia|ovpn|openvpn|l2tp|pptp|sstp|ikev2|ipsec)/)) {
                    category = 'vpn';
                    icon = '🔐';
                } else if (name.match(/^(usb|rndis|cdc|ecm|ncm|qmi|rmnet|mbim)/)) {
                    category = 'usb';
                    icon = '🔌';
                } else if (name.match(/^(veth|macvlan|ipvlan|dummy|vrf|vcan|vxcan)/)) {
                    category = 'virtual';
                    icon = '💭';
                }

                result.push({
                    name: name,
                    description: name,
                    category: category,
                    icon: icon
                });
            }
        });

        const categoryOrder = ['wan', 'ethernet', 'wifi', 'usb', 'vpn', 'virtual', 'other'];
        return result.sort((a, b) => {
            const catA = categoryOrder.indexOf(a.category);
            const catB = categoryOrder.indexOf(b.category);
            if (catA !== catB) return catA - catB;
            return a.name.localeCompare(b.name);
        });
    } catch (e) {
        console.error('Failed to get network interfaces:', e);
        return [];
    }
}

async function loadExcludedInterfaces() {
    try {
        const content = await L.resolveDefault(fs.read('/opt/clash/excluded_interfaces'), '');
        return content.split('\n').filter(line => line.trim()).map(line => line.trim());
    } catch (e) {
        return [];
    }
}

async function saveExcludedInterfaces(interfaces) {
    const content = interfaces.join('\n') + (interfaces.length > 0 ? '\n' : '');
    try {
        await fs.write('/opt/clash/excluded_interfaces', content);
        ui.addNotification(null, E('p', _('Interface exclusions saved. Please restart the Clash service for changes to take effect.')), 'info');

        updateCurrentStatus(interfaces);

        return true;
    } catch (e) {
        ui.addNotification(null, E('p', _('Failed to save interface exclusions: %s').format(e.message)), 'error');
        return false;
    }
}

function updateCurrentStatus(excludedInterfaces) {
    const statusElement = document.getElementById('current-excluded-interfaces');
    if (statusElement) {
        statusElement.textContent = excludedInterfaces.length > 0 ? excludedInterfaces.join(', ') : _('None');
    }
}

function createInterfaceSelector(interfaces, excludedInterfaces) {
    const container = E('div', { 'class': 'cbi-section' });

    container.appendChild(E('h2', _('Interface Exclusions')));
    container.appendChild(E('div', { 'class': 'cbi-section-descr' },
        _('Select network interfaces to exclude from proxy. These interfaces will use direct routing (bypass proxy). WAN interface is automatically detected and excluded.')));

    const groupedInterfaces = {};
    const categoryNames = {
        'wan': _('WAN Interfaces'),
        'ethernet': _('Ethernet Interfaces'),
        'wifi': _('WiFi Interfaces'),
        'usb': _('USB Interfaces'),
        'vpn': _('VPN Interfaces'),
        'virtual': _('Virtual Interfaces'),
        'other': _('Other Interfaces')
    };

    interfaces.forEach(function(iface) {
        if (!groupedInterfaces[iface.category]) {
            groupedInterfaces[iface.category] = [];
        }
        groupedInterfaces[iface.category].push(iface);
    });

    const mainContainer = E('div', { 'style': 'margin: 15px 0;' });

    Object.keys(groupedInterfaces).forEach(function(category) {
        if (groupedInterfaces[category].length === 0) return;

        const groupContainer = E('div', {
            'class': 'cbi-section',
            'style': 'margin-bottom: 5px; border: 1px solid #ddd; border-radius: 4px; padding: 0 8px 8px 8px; background-color: #f9f9f9;'
        });

        const groupTitle = E('h4', {
            'style': 'color: #555; font-size: 13px;'
        }, categoryNames[category] || category);

        groupContainer.appendChild(groupTitle);

        const interfaceGrid = E('div', {
            'style': 'display: grid; grid-template-columns: repeat(auto-fill, minmax(160px, 1fr)); gap: 6px;'
        });

        groupedInterfaces[category].forEach(function(iface) {
            const isChecked = excludedInterfaces.includes(iface.name);

            const checkbox = E('input', {
                'type': 'checkbox',
                'id': 'iface_' + iface.name,
                'value': iface.name,
                'style': 'position: absolute; left: 6px; top: 50%; transform: translateY(-50%); z-index: 2;'
            });

            setTimeout(() => {
                checkbox.checked = isChecked;
                updateLabelStyle();
            }, 0);

            const label = E('label', {
                'for': 'iface_' + iface.name,
                'style': 'display: flex; align-items: center; padding: 6px 6px 6px 24px; border: 1px solid #ccc; border-radius: 3px; cursor: pointer; background-color: white; transition: all 0.15s ease; font-size: 13px; min-height: 32px; position: relative;'
            }, [
                E('span', { 'style': 'margin-right: 6px; font-size: 14px;' }, iface.icon),
                E('span', { 'style': 'font-weight: 500;' }, iface.description)
            ]);

            const wrapper = E('div', { 'style': 'position: relative;' }, [
                checkbox,
                label
            ]);

            function updateLabelStyle() {
                if (checkbox.checked) {
                    label.style.borderColor = '#0066cc';
                    label.style.backgroundColor = '#e6f3ff';
                } else {
                    label.style.borderColor = '#ccc';
                    label.style.backgroundColor = 'white';
                }
            }

            label.addEventListener('mouseover', function() {
                if (!checkbox.checked) {
                    this.style.borderColor = '#0066cc';
                    this.style.backgroundColor = '#f0f8ff';
                }
            });

            label.addEventListener('mouseout', function() {
                updateLabelStyle();
            });

            checkbox.addEventListener('change', updateLabelStyle);

            interfaceGrid.appendChild(wrapper);
        });

        groupContainer.appendChild(interfaceGrid);
        mainContainer.appendChild(groupContainer);
    });

    container.appendChild(mainContainer);

    const buttonContainer = E('div', { 'style': 'margin-top: 15px; text-align: center;' }, [
        E('button', {
            'class': 'btn cbi-button-apply',
            'style': 'margin-right: 8px;',
            'click': function() {
                const selected = [];
                const checkboxes = container.querySelectorAll('input[type="checkbox"]:checked');
                checkboxes.forEach(function(cb) {
                    selected.push(cb.value);
                });
                saveExcludedInterfaces(selected);
            }
        }, _('Save Settings')),

        E('button', {
            'class': 'btn cbi-button-reset',
            'click': function() {
                const checkboxes = container.querySelectorAll('input[type="checkbox"]');
                checkboxes.forEach(function(cb) {
                    cb.checked = false;
                    const label = cb.nextElementSibling;
                    label.style.borderColor = '#ccc';
                    label.style.backgroundColor = 'white';
                });
                updateCurrentStatus([]);
            }
        }, _('Clear All'))
    ]);

    container.appendChild(buttonContainer);

    return container;
}

return view.extend({
    load: function() {
        return Promise.all([
            getNetworkInterfaces(),
            loadExcludedInterfaces()
        ]);
    },

    render: async function(data) {
        const [interfaces, excludedInterfaces] = data;

        const view = E([
            createInterfaceSelector(interfaces, excludedInterfaces),

            E('div', { 'class': 'cbi-section', 'style': 'margin-top: 20px;' }, [
                E('h3', { 'style': 'font-size: 14px; margin-bottom: 12px; color: #333;' }, _('Current Status')),

                E('div', { 'style': 'display: grid; gap: 8px;' }, [
                    E('div', {
                        'style': 'padding: 8px 12px; background: #f8f9fa; border-left: 4px solid #0066cc; border-radius: 4px; font-size: 12px;'
                    }, [
                        E('span', { 'style': 'color: #0066cc;' }, '📋 ' + _('Excluded interfaces: ')),
                        E('span', {
                            'id': 'current-excluded-interfaces',
                            'style': 'color: #0066cc; font-weight: bold;'
                        }, excludedInterfaces.length > 0 ? excludedInterfaces.join(', ') : _('None'))
                    ]),

                    E('div', {
                        'style': 'padding: 8px 12px; background: #e8f5e8; border-left: 4px solid #28a745; border-radius: 4px; font-size: 12px;'
                    }, [
                        E('span', { 'style': 'color: #155724;' }, _('💡 WAN interface is automatically detected and excluded'))
                    ]),

                    E('div', {
                        'style': 'padding: 8px 12px; background: #fff3cd; border-left: 4px solid #ffc107; border-radius: 4px; font-size: 12px;'
                    }, [
                        E('span', { 'style': 'color: #856404; font-weight: bold;' }, _('⚠️ Restart Clash service after saving changes'))
                    ])
                ])
            ])
        ]);

        return view;
    },

    handleSave: null,
    handleSaveApply: null,
    handleReset: null
});
