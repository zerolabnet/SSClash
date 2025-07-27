'use strict';
'require view';
'require fs';
'require ui';
'require rpc';

let startStopButton = null;
let editor = null;

const callServiceList = rpc.declare({
    object: 'service',
    method: 'list',
    params: ['name'],
    expect: { '': {} }
});

async function getServiceStatus() {
    try {
        return Object.values((await callServiceList('clash'))['clash']['instances'])[0]?.running;
    } catch (ignored) {
        return false;
    }
}

async function startService() {
    if (startStopButton) startStopButton.disabled = true;
    return fs.exec('/etc/init.d/clash', ['start'])
        .then(() => fs.exec('/etc/init.d/clash', ['enable']))
        .catch(function(e) {
            ui.addNotification(null, E('p', _('Unable to start and enable service: %s').format(e.message)), 'error');
        })
        .finally(() => {
            if (startStopButton) startStopButton.disabled = false;
        });
}

async function stopService() {
    if (startStopButton) startStopButton.disabled = true;
    return fs.exec('/etc/init.d/clash', ['stop'])
        .then(() => fs.exec('/etc/init.d/clash', ['disable']))
        .catch(function(e) {
            ui.addNotification(null, E('p', _('Unable to stop and disable service: %s').format(e.message)), 'error');
        })
        .finally(() => {
            if (startStopButton) startStopButton.disabled = false;
        });
}

async function toggleService() {
    const running = await getServiceStatus();
    if (running) {
        await stopService();
    } else {
        await startService();
    }
    setTimeout(() => {
        window.location.reload();
    }, 1000);
}

async function openDashboard() {
    const newWindow = window.open('about:blank', '_blank');

    if (!newWindow) {
        ui.addNotification(null, E('p', _('Popup was blocked. Please allow popups for this site.')), 'warning');
        return;
    }

    try {
        const running = await getServiceStatus();

        if (running) {
            const port = 9090;
            const path = 'ui';
            const protocol = window.location.protocol;
            const hostname = window.location.hostname;

            const url = `${protocol}//${hostname}:${port}/${path}/?hostname=${hostname}&port=${port}`;
            newWindow.location.href = url;
        } else {
            newWindow.close();
            ui.addNotification(null, E('p', _('Service is not running.')), 'error');
        }
    } catch (error) {
        newWindow.close();
        console.error('Error checking service status:', error);
        ui.addNotification(null, E('p', _('Failed to check service status.')), 'error');
    }
}

function loadScript(src) {
    return new Promise((resolve, reject) => {
        const script = document.createElement('script');
        script.src = src;
        script.onload = resolve;
        script.onerror = reject;
        document.head.appendChild(script);
    });
}

async function initializeAceEditor(content) {
    await loadScript('/luci-static/resources/view/ssclash/ace/ace.js');
    ace.config.set('basePath', '/luci-static/resources/view/ssclash/ace/');
    editor = ace.edit("editor");
    editor.setTheme("ace/theme/tomorrow_night_bright");
    editor.session.setMode("ace/mode/yaml");
    editor.setValue(content);
    editor.clearSelection();
    editor.setOptions({
        fontSize: "12px",
        showPrintMargin: false,
        wrap: true
    });
}

return view.extend({
    load: function() {
        return L.resolveDefault(fs.read('/opt/clash/config.yaml'), '');
    },

    render: async function(config) {
        const running = await getServiceStatus();

        const saveAndApply = async function() {
            try {
                const value = editor.getValue().trim() + '\n';
                await fs.write('/opt/clash/config.yaml', value);
                ui.addNotification(null, E('p', _('Configuration saved successfully.')), 'info');
                await fs.exec('/etc/init.d/clash', ['reload']);
                ui.addNotification(null, E('p', _('Service reloaded successfully.')), 'info');
                setTimeout(() => window.location.reload(), 1000);
            } catch(e) {
                ui.addNotification(null, E('p', _('Unable to save contents: %s').format(e.message)), 'error');
            }
        };

        const view = E([
            E('div', {
                'style': 'margin-bottom: 20px;'
            }, [
                E('button', {
                    'class': 'btn',
                    'click': openDashboard
                }, _('Open Dashboard')),
                (startStopButton = E('button', {
                    'class': 'btn',
                    'click': toggleService,
                    'style': 'margin-left: 10px;'
                }, running ? _('Stop Service') : _('Start Service'))),
                E('span', {
                    'class': 'label',
                    'style': `margin-left: 15px; padding: 4px 8px; border-radius: 3px; font-size: 12px; color: white; background-color: ${running ? '#5cb85c' : '#d9534f'};`
                }, running ? _('Clash is running') : _('Clash stopped'))
            ]),
            E('h2', _('Clash Configuration')),
            E('p', { 'class': 'cbi-section-descr' }, _('Your current Clash config. When applied, the changes will be saved and the service will be restarted.')),
            E('div', {
                'id': 'editor',
                'style': 'width: 100%; height: 640px; margin-bottom: 15px;'
            }),
            E('div', { 'style': 'text-align: center; margin-top: 15px; margin-bottom: 20px;' }, [
                E('button', {
                    'class': 'btn',
                    'click': saveAndApply
                }, _('Save & Apply Configuration'))
            ])
        ]);

        initializeAceEditor(config);
        return view;
    },

    handleSave: null,
    handleSaveApply: null,
    handleReset: null
});
