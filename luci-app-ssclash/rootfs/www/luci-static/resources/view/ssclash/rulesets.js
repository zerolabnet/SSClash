'use strict';
'require view';
'require fs';
'require ui';

const editors = {};
const rulesetPath = '/opt/clash/lst/';
const FAKEIP_WHITELIST_FILENAME = 'fakeip-whitelist-ipcidr.txt';

function loadScript(src) {
    return new Promise((resolve, reject) => {
        if (document.querySelector(`script[src="${src}"]`)) {
            return resolve();
        }
        const script = document.createElement('script');
        script.src = src;
        script.onload = resolve;
        script.onerror = reject;
        document.head.appendChild(script);
    });
}

async function initializeAceEditor(filename, content) {
    await loadScript('/luci-static/resources/view/ssclash/ace/ace.js');
    ace.config.set('basePath', '/luci-static/resources/view/ssclash/ace/');

    const editor = ace.edit(`editor-${filename}`);
    editor.setTheme("ace/theme/tomorrow_night_bright");
    editor.session.setMode("ace/mode/text");
    editor.setValue(content, -1);
    editor.setOptions({
        fontSize: "12px",
        showPrintMargin: false,
        wrap: true,
    });

    editors[filename] = editor;
}

async function handleSave(filename) {
    if (!editors[filename]) {
        ui.addNotification(null, E('p', _('Editor not initialized.')), 'error');
        return;
    }
    ui.showModal(_('Saving...'), [ E('p', { 'class': 'spinning' }, _('Please wait')) ]);

    try {
        const content = editors[filename].getValue().trim();
        const finalContent = content ? content + '\n' : '';
        await fs.write(`${rulesetPath}${filename}`, finalContent);
        ui.addNotification(null, E('p', _('List "%s" saved successfully.').format(filename)), 'success');
    } catch (e) {
        ui.addNotification(null, E('p', _('Failed to save list "%s": %s').format(filename, e.message)), 'error');
    } finally {
        ui.hideModal();
    }
}

async function handleDelete(filename) {
    ui.showModal(_('Delete Ruleset'), [
        E('p', _('Are you sure you want to delete the list "%s"? This action cannot be undone.').format(filename)),
        E('div', { 'class': 'right' }, [
            E('button', { 'class': 'btn', 'click': ui.hideModal }, _('Cancel')),
            E('button', {
                'class': 'btn',
                'style': 'margin-left: 10px;',
                'click': async () => {
                    ui.showModal(_('Deleting...'), [ E('p', { 'class': 'spinning' }, _('Please wait')) ]);
                    try {
                        await fs.remove(`${rulesetPath}${filename}`);
                        ui.addNotification(null, E('p', _('List "%s" has been deleted.').format(filename)), 'info');
                        window.location.reload();
                    } catch (e) {
                        ui.addNotification(null, E('p', _('Failed to delete list "%s": %s').format(filename, e.message)), 'error');
                        ui.hideModal();
                    }
                }
            }, _('Delete'))
        ])
    ]);
}

function handleCreate(existingRulesets) {
    const nameInput = E('input', {
        'type': 'text',
        'class': 'cbi-input-text',
        'placeholder': _('e.g., my-custom-list')
    });

    const validationMessage = E('p', { 'style': 'color: red; display: none; margin-top: 10px;' });
    const existingFilenames = existingRulesets.map(r => r.name);

    const validate = (value) => {
        if (!/^[a-zA-Z0-9_-]+$/.test(value)) {
            validationMessage.textContent = _('Invalid name. Only letters, numbers, underscores, and hyphens are allowed.');
            validationMessage.style.display = 'block';
            return false;
        }

        const newFilename = value.toLowerCase() + '.txt';
        if (existingFilenames.includes(newFilename)) {
            validationMessage.textContent = _('A list with this name already exists.');
            validationMessage.style.display = 'block';
            return false;
        }

        validationMessage.style.display = 'none';
        return true;
    };

    ui.showModal(_('Create New Ruleset'), [
        E('div', { 'class': 'cbi-value' }, [
            E('label', { 'class': 'cbi-value-title' }, _('List Name')),
            E('div', { 'class': 'cbi-value-field' }, nameInput)
        ]),
        validationMessage,
        E('div', { 'class': 'right' }, [
            E('button', { 'class': 'btn', 'click': ui.hideModal }, _('Cancel')),
            E('button', {
                'class': 'btn',
                'style': 'margin-left: 10px;',
                'click': async () => {
                    const name = nameInput.value;
                    if (!validate(name)) return;

                    const filename = name.toLowerCase() + '.txt';
                    ui.showModal(_('Creating...'), [ E('p', { 'class': 'spinning' }, _('Please wait')) ]);

                    try {
                        await fs.write(`${rulesetPath}${filename}`, '');
                        ui.addNotification(null, E('p', _('New list "%s" created.').format(filename)), 'success');
                        window.location.reload();
                    } catch (e) {
                        ui.addNotification(null, E('p', _('Failed to create list: %s').format(e.message)), 'error');
                        ui.hideModal();
                    }
                }
            }, _('Create'))
        ])
    ]);
}

async function detectFakeIpWhitelistMode() {
    try {
        const configContent = await L.resolveDefault(fs.read('/opt/clash/config.yaml'), '');
        if (!configContent) return false;

        let inDns = false;
        let dnsEnabled = false;
        let isEnhancedFakeIp = false;
        let filterMode = 'blacklist';

        for (const line of configContent.split('\n')) {
            const trimmed = line.trim();
            if (trimmed.match(/^dns:\s*$/)) { inDns = true; continue; }
            if (inDns && trimmed.length > 0 && !line.match(/^[\s]/)) { inDns = false; }
            if (!inDns) continue;
            if (trimmed.match(/^enable:\s*true/)) dnsEnabled = true;
            if (trimmed.match(/^enhanced-mode:\s*fake-ip/)) isEnhancedFakeIp = true;
            const modeMatch = trimmed.match(/^fake-ip-filter-mode:\s*(\S+)/);
            if (modeMatch) filterMode = modeMatch[1].toLowerCase().replace(/['"]/g, '');
        }

        return dnsEnabled && isEnhancedFakeIp && filterMode === 'whitelist';
    } catch (e) {
        console.error('Failed to detect fake-ip-filter-mode:', e);
        return false;
    }
}

async function handleSaveFakeIpWhitelist() {
    const editor = editors[FAKEIP_WHITELIST_FILENAME];
    if (!editor) {
        ui.addNotification(null, E('p', _('Editor not initialized.')), 'error');
        return;
    }
    ui.showModal(_('Saving...'), [ E('p', { 'class': 'spinning' }, _('Please wait')) ]);

    try {
        const content = editor.getValue().trim();
        const finalContent = content ? content + '\n' : '';
        await fs.write(`${rulesetPath}${FAKEIP_WHITELIST_FILENAME}`, finalContent);

        const result = await fs.exec('/opt/clash/bin/clash-rules', ['update-ip-whitelist']);
        if (result && result.code === 0) {
            ui.addNotification(null, E('p', _('IP-CIDR whitelist saved and firewall rules updated.')), 'success');
        } else {
            const errMsg = (result && (result.stderr || result.stdout || '').trim()) || _('unknown error');
            ui.addNotification(null, E('p', _('IP-CIDR whitelist saved, but firewall update failed: %s').format(errMsg)), 'warning');
        }
    } catch (e) {
        ui.addNotification(null, E('p', _('Failed to save IP-CIDR whitelist: %s').format(e.message)), 'error');
    } finally {
        ui.hideModal();
    }
}

return view.extend({
    load: async function() {
        const isWhitelistMode = await detectFakeIpWhitelistMode();

        let whitelistContent = '';
        if (isWhitelistMode) {
            try {
                const existing = await L.resolveDefault(fs.read(`${rulesetPath}${FAKEIP_WHITELIST_FILENAME}`), null);
                if (existing === null) {
                    await fs.write(`${rulesetPath}${FAKEIP_WHITELIST_FILENAME}`, '');
                } else {
                    whitelistContent = existing;
                }
            } catch (e) {
                console.warn('Failed to access fakeip whitelist file:', e);
            }
        }

        try {
            const files = await fs.list(rulesetPath);
            const txtFiles = files.filter(file =>
                file.name.endsWith('.txt') && file.name !== FAKEIP_WHITELIST_FILENAME
            );
            const promises = txtFiles.map(file =>
                fs.read_direct(`${rulesetPath}${file.name}`)
                  .then(content => ({ name: file.name, content: content || '' }))
            );
            const rulesets = await Promise.all(promises);
            return { isWhitelistMode, whitelistContent, rulesets };
        } catch (err) {
            ui.addNotification(null, E('p', _('Cannot read ruleset directory: %s').format(err.message)));
            return { isWhitelistMode, whitelistContent, rulesets: [] };
        }
    },

    render: function(data) {
        const { isWhitelistMode, whitelistContent, rulesets } = data || { isWhitelistMode: false, whitelistContent: '', rulesets: [] };

        const sections = rulesets.map(ruleset => {
            const filename = ruleset.name;

            const header = E('h3', {
                'class': 'cbi-section-title',
                'style': 'cursor: pointer;',
                'click': (e) => {
                    const contentDiv = e.target.nextElementSibling;
                    const isActive = contentDiv.style.display === 'block';
                    e.target.classList.toggle('active', !isActive);
                    contentDiv.style.display = isActive ? 'none' : 'block';
                    if (!editors[filename] && !isActive) {
                        initializeAceEditor(filename, ruleset.content);
                    }
                }
            }, `./lst/${filename}`);

            const saveButton = E('button', { 'class': 'btn', 'click': () => handleSave(filename) }, _('Save'));
            const deleteButton = E('button', { 'class': 'btn', 'style': 'margin-left: 10px;', 'click': () => handleDelete(filename) }, _('Delete'));

            const content = E('div', {
                'class': 'cbi-section-node',
                'style': 'display: none;'
            }, [
                E('div', { 'id': `editor-${filename}`, 'style': 'min-height: 200px; height: 600px; margin-bottom: 10px; border-radius: 4px;' }),
                E('div', { 'style': 'text-align: center;' }, [saveButton, deleteButton])
            ]);

            return E('div', { 'style': 'padding: 10px 15px; border: 1px solid #ddd; border-radius: 5px; background-color: #f9f9f9; margin: 15px 0;' }, [
                header,
                content
            ]);
        });

        const style = E('style', {}, `
            .cbi-section-title::before { content: '▶'; display: inline-block; margin-right: 10px; font-size: 0.8em; transition: transform 0.2s ease-in-out; }
            .cbi-section-title.active::before { transform: rotate(90deg); }
        `);

        const whitelistSections = [];
        if (isWhitelistMode) {
            const editorId = `editor-${FAKEIP_WHITELIST_FILENAME}`;

            const whitelistBlock = E('div', {
                'style': 'padding: 10px 15px; border: 2px solid #0066cc; border-radius: 5px; background-color: #f0f8ff; margin: 15px 0;'
            }, [
                E('div', { 'style': 'display: flex; align-items: center; margin-bottom: 8px;' }, [
                    E('span', {
                        'style': 'display: inline-block; background: #0066cc; color: white; padding: 2px 8px; border-radius: 3px; font-size: 11px; font-weight: bold; margin-right: 10px; white-space: nowrap;'
                    }, _('TECHNICAL')),
                    E('h3', { 'style': 'margin: 0; color: #0066cc;' },
                        _('IP-CIDR List (fake-ip whitelist mode)'))
                ]),
                E('p', { 'class': 'cbi-section-descr', 'style': 'margin-bottom: 10px;' },
                    _('This list is used by the firewall (nftables/iptables) to mark traffic to specified IPs and subnets for proxying in fake-ip whitelist mode. Enter one IPv4 address or CIDR per line (e.g. 8.8.8.8 or 1.2.3.0/24). Lines starting with # are treated as comments. Saving applies changes immediately without restarting Mihomo.')
                ),
                E('div', { 'id': editorId, 'style': 'min-height: 150px; height: 350px; margin-bottom: 10px; border-radius: 4px;' }),
                E('div', { 'style': 'text-align: center;' }, [
                    E('button', { 'class': 'btn', 'click': handleSaveFakeIpWhitelist }, _('Save'))
                ])
            ]);

            whitelistSections.push(whitelistBlock);

            setTimeout(() => {
                initializeAceEditor(FAKEIP_WHITELIST_FILENAME, whitelistContent || '');
            }, 100);
        }

        return E('div', {}, [
            style,
            E('div', { class: 'cbi-section' }, [
                E('div', { 'style': 'display: flex; justify-content: space-between; align-items: center;' }, [
                    E('h2', _('Local Rulesets')),
                    E('button', {
                        'class': 'btn',
                        'click': () => handleCreate(rulesets)
                    }, _('Create New List'))
                ]),
                E('p', { class: 'cbi-section-descr' }, [
                    _('Here you can manage local lists for use in rule-providers.')
                ]),
                E('div', {
                    'class': 'cbi-section-descr',
                    'style': 'margin-top: 8px;'
                }, [
                    E('div', { 'style': 'margin-bottom: 4px; font-weight: bold;' },
                        _('Example usage in your config.yaml:')),
                    E('pre', {
                        'style': 'margin: 0; font-family: monospace; background: #f7f7f7; padding: 8px 10px; border-radius: 4px; border: 1px solid #e0e0e0; white-space: pre;'
                    }, 'rule-providers:\n  your-list-name:\n    behavior: classical\n    type: file\n    format: text\n    path: ./lst/your-list-name.txt')
                ])
            ]),
            ...whitelistSections,
            ...sections
        ]);
    },

    handleSaveApply: null,
    handleSave: null,
    handleReset: null
});
