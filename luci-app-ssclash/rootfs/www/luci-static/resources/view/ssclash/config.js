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

// =============================================================================
// SECTION: SSClash version / update footer helpers
// =============================================================================

// Keep in sync with luci-app-ssclash/Makefile PKG_VERSION
const SSCLASH_VERSION = '4.4.0';

const SSCLASH_REPO = 'zerolabnet/SSClash';
const SSCLASH_RELEASES_URL = 'https://github.com/' + SSCLASH_REPO + '/releases';
const SSCLASH_LATEST_API  = 'https://api.github.com/repos/' + SSCLASH_REPO + '/releases/latest';
const SSCLASH_AUTHOR_URL  = 'https://zerolab.net';
const SSCLASH_DONATE_URL  = 'https://zerolab.net/donate/';

function parseSemver(s) {
    const m = (s || '').match(/v?(\d+)\.(\d+)\.(\d+)/);
    return m ? [+m[1], +m[2], +m[3]] : null;
}

function cmpSemver(a, b) {
    const pa = parseSemver(a), pb = parseSemver(b);
    if (!pa || !pb) return 0;
    for (let i = 0; i < 3; i++) if (pa[i] !== pb[i]) return pa[i] - pb[i];
    return 0;
}

async function getLatestSSClashRelease() {
    try {
        const resp = await fetch(SSCLASH_LATEST_API);
        if (!resp.ok) return null;
        const d = await resp.json();
        if (d.prerelease) return null;
        return { version: d.tag_name, url: d.html_url || SSCLASH_RELEASES_URL };
    } catch (_e) {
        return null;
    }
}

return view.extend({
    load: function() {
        return L.resolveDefault(fs.read('/opt/clash/config.yaml'), '');
    },
    render: async function(config) {
        const running = await getServiceStatus();

        const writeAndTestConfig = async function() {
            const value = editor.getValue().trim() + '\n';

            await fs.write('/opt/clash/config.yaml', value);
            ui.addNotification(null, E('p', _('Configuration saved successfully.')), 'info');

            const testResult = await fs.exec('/opt/clash/bin/clash', ['-d', '/opt/clash', '-t']);
            if (testResult.code !== 0) {
                const rawDetail = (testResult.stderr || testResult.stdout || '').trim();
                let shortDetail = rawDetail;

                if (rawDetail) {
                    const lines = rawDetail.split('\n');
                    let found = false;
                    for (const line of lines) {
                        const msgMatch = line.match(/msg="([^"]+)"/);
                        if (msgMatch) {
                            shortDetail = msgMatch[1].trim();
                            found = true;
                            break;
                        }
                    }
                    if (!found) {
                        const nonEmpty = lines.filter(l => l.trim().length > 0);
                        if (nonEmpty.length > 0) {
                            shortDetail = nonEmpty[nonEmpty.length - 1].trim();
                        }
                    }
                }

                ui.addNotification(null, E('p',
                    _('Configuration test failed — service not reloaded. Please fix the errors below: %s')
                    .format(shortDetail || _('unknown error'))
                ), 'error');
                return null;
            }

            return value;
        };

        const saveAndRestartCore = async function() {
            if (startStopButton) startStopButton.disabled = true;
            try {
                const value = await writeAndTestConfig();
                if (value === null) return;

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

        const saveAndReloadConfig = async function() {
            if (startStopButton) startStopButton.disabled = true;
            try {
                if (!(await getServiceStatus())) {
                    ui.addNotification(null, E('p',
                        _('Service is not running — config reload requires a running Mihomo instance. Use "Save & Restart core" instead.')
                    ), 'warning');
                    return;
                }

                const value = await writeAndTestConfig();
                if (value === null) return;

                const ec = parseYamlValue(value, 'external-controller');
                const ecTls = parseYamlValue(value, 'external-controller-tls');
                const secret = parseYamlValue(value, 'secret') || '';
                const useTls = !!ecTls;

                const { host, port } = normalizeHostPortFromAddr(
                    useTls ? ecTls : ec,
                    '127.0.0.1',
                    useTls ? '9443' : '9090'
                );
                const scheme = useTls ? 'https' : 'http';

                const curlArgs = [
                    '-sS', '-o', '/dev/null', '-w', '%{http_code}',
                    '-X', 'PUT',
                    '-H', 'Content-Type: application/json',
                    '-H', 'Authorization: Bearer ' + secret,
                    '--data', '{"path":"","payload":""}',
                    '--connect-timeout', '5',
                    '--max-time', '15'
                ];
                if (useTls) {
                    curlArgs.push('-k');
                }
                curlArgs.push(scheme + '://' + host + ':' + port + '/configs?force=true');

                const res = await fs.exec('curl', curlArgs);
                const httpCode = (res.stdout || '').trim();

                if (res.code !== 0 || (httpCode !== '204' && httpCode !== '200')) {
                    let detail = (res.stderr || '').trim();
                    if (useTls && /Protocol\s+"?https"?\s+not\s+supported/i.test(detail)) {
                        detail += ' ' + _('(Hint: the system curl has no HTTPS support. Install curl-ssl, or use plain external-controller for hot reload.)');
                    }
                    ui.addNotification(null, E('p',
                        _('Config reload failed (%s, HTTP %s). %s Try "Save & Restart core" for a full restart.')
                        .format(scheme, httpCode || 'n/a', detail ? detail : '')
                    ), 'error');
                    return;
                }

                fs.exec('/opt/clash/bin/clash-rules', ['update']).catch(function(err) {
                    ui.addNotification(null, E('p',
                        _('Config reloaded, but updating subscription IP cache failed: %s').format((err && err.message) || String(err))
                    ), 'warning');
                });

                ui.addNotification(null, E('p',
                    _('Config reloaded via Mihomo API — active connections preserved.')
                ), 'info');

                await pollStatus(true);
            } catch(e) {
                ui.addNotification(null, E('p',
                    _('Config reload error: %s. Try "Save & Restart core" for a full restart.').format(e.message)
                ), 'error');
            } finally {
                if (startStopButton) startStopButton.disabled = false;
            }
        };

        const splitMenu = E('div', {
            'class': 'ssclash-split-menu',
            'style': 'position: absolute; top: 100%; right: 0; display: none; min-width: 220px; margin-top: 3px; background: #fff; color: #333; border: 1px solid rgba(0,0,0,0.2); border-radius: 3px; box-shadow: 0 3px 8px rgba(0,0,0,0.2); z-index: 1000;'
        }, [
            E('button', {
                'class': 'btn',
                'click': function() { splitMenu.style.display = 'none'; saveAndRestartCore(); },
                'style': 'display: block; width: 100%; text-align: left; margin: 0; border: 0; border-radius: 0; background: transparent; padding: 8px 14px;',
                'title': _('Full restart: stops and starts the Mihomo core, rebuilds firewall rules and refreshes subscription IPs. Active connections are dropped.')
            }, _('Save & Restart core'))
        ]);

        const splitContainer = E('div', {
            'class': 'ssclash-split-btn',
            'style': 'display: inline-flex; align-items: stretch; position: relative;'
        }, [
            E('button', {
                'class': 'btn',
                'click': saveAndReloadConfig,
                'style': 'margin: 0; border-top-right-radius: 0; border-bottom-right-radius: 0; border-right: 0;',
                'title': _('Reload configuration via Mihomo API — active connections are preserved. Firewall rules are NOT rebuilt; use "Save & Restart core" when changing external-controller / tproxy-port / tun / fake-ip-filter-mode / proxy mode.')
            }, _('Save & Reload config')),
            E('button', {
                'class': 'btn',
                'style': 'margin: 0; border-top-left-radius: 0; border-bottom-left-radius: 0; padding-left: 10px; padding-right: 10px;',
                'aria-haspopup': 'true',
                'aria-label': _('More actions'),
                'click': function(ev) {
                    ev.stopPropagation();
                    splitMenu.style.display = (splitMenu.style.display === 'block') ? 'none' : 'block';
                }
            }, '\u25BE'),
            splitMenu
        ]);

        document.addEventListener('click', function(ev) {
            if (!splitContainer.contains(ev.target)) splitMenu.style.display = 'none';
        });

        const dot = () => E('span', { 'style': 'margin: 0 6px; opacity: 0.35;' }, '\u00B7');

        const versionFooter = E('div', {
            'id': 'ssclash-version-footer',
            'style': 'margin-top: 20px; padding: 10px 0; border-top: 1px solid rgba(127,127,127,0.15); text-align: center; font-size: 11px; color: #999;'
        }, [
            E('span', {}, 'SSClash v' + SSCLASH_VERSION),
            dot(),
            E('span', {}, [
                'by ',
                E('a', { 'href': SSCLASH_AUTHOR_URL, 'target': '_blank', 'rel': 'noopener' }, 'ZeroChaos')
            ]),
            dot(),
            E('a', { 'href': SSCLASH_DONATE_URL, 'target': '_blank', 'rel': 'noopener' }, _('Donate')),
            dot(),
            E('span', { 'id': 'ssclash-update-status' }, '\u2026')
        ]);

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
                splitContainer
            ]),
            versionFooter
        ]);

        initializeAceEditor(config);

        (async function updateVersionFooter() {
            const status = view.querySelector('#ssclash-update-status');
            if (!status) return;

            const latest = await getLatestSSClashRelease();
            if (!latest) {
                status.textContent = _('update check failed');
                return;
            }

            if (cmpSemver(latest.version, SSCLASH_VERSION) > 0) {
                status.textContent = '';
                status.appendChild(E('a', {
                    'href': latest.url,
                    'target': '_blank',
                    'rel': 'noopener'
                }, latest.version + ' \u2191'));
            } else {
                status.textContent = '\u2713';
            }
        })();

        return view;
    },
    handleSave: null,
    handleSaveApply: null,
    handleReset: null
});
