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
        const instances = (await callServiceList('clash'))['clash']?.instances;
        return Object.values(instances || {})[0]?.running || false;
    } catch (e) {
        return false;
    }
}

async function handleServiceAction(actions, errorMsg) {
    if (startStopButton) startStopButton.disabled = true;
    try {
        for (const action of actions) {
            await fs.exec('/etc/init.d/clash', [action]);
        }
    } catch (e) {
        ui.addNotification(null, E('p', errorMsg.format(e.message)), 'error');
    } finally {
        if (startStopButton) startStopButton.disabled = false;
    }
}

async function startService() {
    await handleServiceAction(['start', 'enable'], _('Unable to start and enable service: %s'));
}

async function stopService() {
    await handleServiceAction(['stop', 'disable'], _('Unable to stop and disable service: %s'));
}

async function pollStatus(targetStatus, timeout = 5000) {
    const startTime = Date.now();
    while (Date.now() - startTime < timeout) {
        if (await getServiceStatus() === targetStatus) {
            return true;
        }
        await new Promise(resolve => setTimeout(resolve, 500));
    }
    return false;
}

async function toggleService() {
    const running = await getServiceStatus();
    if (running) {
        await stopService();
        await pollStatus(false);
    } else {
        await startService();
        await pollStatus(true);
    }
    window.location.reload();
}

function parseYamlValue(yaml, key) {
    const regex = new RegExp(`^\\s*${key}:[ \t]*([^#\n\r]*)`, 'm');
    const match = yaml.match(regex);
    return match ? match[1].trim() : null;
}

async function openDashboard() {
    const newWindow = window.open('about:blank', '_blank');
    if (!newWindow) {
        ui.addNotification(null, E('p', _('Popup was blocked. Please allow popups for this site.')), 'warning');
        return;
    }

    try {
        if (!(await getServiceStatus())) {
            newWindow.close();
            ui.addNotification(null, E('p', _('Service is not running.')), 'error');
            return;
        }

        const config = await fs.read('/opt/clash/config.yaml');
        const externalController = parseYamlValue(config, 'external-controller');
        const port = externalController ? externalController.split(':').pop() : '9090';

        const path = parseYamlValue(config, 'external-ui') || 'ui';
        const protocol = window.location.protocol;
        const hostname = window.location.hostname;

        const url = `${protocol}//${hostname}:${port}/${path}/?hostname=${hostname}&port=${port}`;
        newWindow.location.href = url;
    } catch (error) {
        newWindow.close();
        console.error(_('Error opening dashboard:'), error);
        ui.addNotification(null, E('p', _('Failed to open dashboard: %s').format(error.message)), 'error');
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
            if (startStopButton) startStopButton.disabled = true;
            try {
                const value = editor.getValue().trim() + '\n';
                await fs.write('/opt/clash/config.yaml', value);
                ui.addNotification(null, E('p', _('Configuration saved successfully.')), 'info');
                await fs.exec('/etc/init.d/clash', ['reload']);
                ui.addNotification(null, E('p', _('Service reloaded successfully.')), 'info');
                await pollStatus(true);
                window.location.reload();
            } catch(e) {
                ui.addNotification(null, E('p', _('Unable to save contents: %s').format(e.message)), 'error');
            } finally {
                if (startStopButton) startStopButton.disabled = false;
            }
        };

        const view = E([
            E('div', { 'style': 'margin-bottom: 20px;' }, [
                E('button', { 'class': 'btn', 'click': openDashboard }, _('Open Dashboard')),
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
