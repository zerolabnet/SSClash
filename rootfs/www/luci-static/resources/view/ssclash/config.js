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
    const escapedKey = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const re = new RegExp(`^\\s*${escapedKey}\\s*:\\s*(["\']?)([^#\\r\\n]+?)\\1\\s*(?:#.*)?$`, 'm');
    const m = yaml.match(re);
    return m ? m[2].trim() : null;
}

function normalizeHostPortFromAddr(addr, fallbackHost, fallbackPort) {
    if (!addr) return { host: fallbackHost, port: fallbackPort };
    const cleaned = addr.replace(/["']/g, '').trim();
    const hostPort = cleaned.replace(/^\[|\]$/g, '');
    const lastColon = hostPort.lastIndexOf(':');
    let host = fallbackHost, port = fallbackPort;
    if (lastColon !== -1) {
        host = hostPort.slice(0, lastColon);
        port = hostPort.slice(lastColon + 1);
    }
    if (host === '0.0.0.0' || host === '::' || host === '') {
        host = fallbackHost;
    }
    return { host, port };
}

function computeUiPath(externalUiName, externalUi) {
    if (externalUiName) {
        const name = externalUiName.replace(/(^\/+|\/+$)/g, '');
        return `/${name}/`;
    }
    if (externalUi && !/[\/\\\.]/.test(externalUi)) {
        const name = externalUi.trim();
        return `/${name}/`;
    }
    return '/ui/';
}

async function openDashboard() {
    try {
        if (!(await getServiceStatus())) {
            ui.addNotification(null, E('p', _('Service is not running.')), 'error');
            return;
        }

        const config = await fs.read('/opt/clash/config.yaml');
        const ec = parseYamlValue(config, 'external-controller');
        const ecTls = parseYamlValue(config, 'external-controller-tls');
        const secret = parseYamlValue(config, 'secret');
        const externalUi = parseYamlValue(config, 'external-ui');
        const externalUiName = parseYamlValue(config, 'external-ui-name');

        const baseHost = window.location.hostname;
        const basePort = '9090';
        const useTls = !!ecTls;

        const { host, port } = normalizeHostPortFromAddr(useTls ? ecTls : ec, baseHost, basePort);
        const scheme = useTls ? 'https:' : 'http:';
        const uiPath = computeUiPath(externalUiName, externalUi);

        const qp = new URLSearchParams();
        if (secret) qp.set('secret', secret);
        qp.set('hostname', host);
        qp.set('port', port);
        const url = `${scheme}//${host}:${port}${uiPath}?${qp.toString()}`;

        const newWindow = window.open(url, '_blank');
        if (!newWindow) {
            ui.addNotification(null, E('p', _('Popup was blocked. Please allow popups for this site.')), 'warning');
        }
    } catch (error) {
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
            E('div', {
                'style': 'margin-bottom: 20px; display: flex; flex-wrap: wrap; align-items: center; gap: 10px;'
            }, [
                E('button', {
                    'class': 'btn',
                    'click': openDashboard,
                    'style': 'margin: 0;'
                }, _('Open Dashboard')),

                (startStopButton = E('button', {
                    'class': 'btn',
                    'click': toggleService,
                    'style': 'margin: 0;'
                }, running ? _('Stop Service') : _('Start Service'))),

                E('span', {
                    'class': 'label',
                    'style': `padding: 4px 10px; border-radius: 3px; font-size: 12px; color: white; background-color: ${running ? '#5cb85c' : '#d9534f'}; margin: 0;`
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
