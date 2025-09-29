'use strict';
'require view';
'require fs';
'require ui';

let editor = null;
const localServersPath = '/opt/clash/proxy_providers_persistent/local.txt';
const tmpfsPath = '/tmp/clash/proxy_providers/local.txt';

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

async function initializeAceEditor(content) {
    await loadScript('/luci-static/resources/view/ssclash/ace/ace.js');
    ace.config.set('basePath', '/luci-static/resources/view/ssclash/ace/');
    
    editor = ace.edit("servers-editor");
    editor.setTheme("ace/theme/tomorrow_night_bright");
    editor.session.setMode("ace/mode/text");
    editor.setValue(content, -1);
    editor.setOptions({
        fontSize: "12px",
        showPrintMargin: false,
        wrap: true
    });
}



async function handleSave() {
    if (!editor) {
        ui.addNotification(null, E('p', _('Editor not initialized.')), 'error');
        return;
    }
    
    ui.showModal(_('Saving...'), [E('p', { 'class': 'spinning' }, _('Please wait'))]);
    
    try {
        const content = editor.getValue().trim();
        const finalContent = content ? content + '\n' : '';
        
        // Save to tmpfs first for immediate use by Clash
        await fs.write(tmpfsPath, finalContent);
        
        // Then save to persistent storage for survival after reboot
        try {
            await fs.write(localServersPath, finalContent);
        } catch (persistentError) {
            console.warn('Failed to save to persistent storage:', persistentError);
        }
        
        ui.addNotification(null, E('p', _('Local servers saved successfully!')), 'success');
        
    } catch (e) {
        ui.addNotification(null, E('p', _('Failed to save local servers: %s').format(e.message)), 'error');
    } finally {
        ui.hideModal();
    }
}

async function handleClear() {
    ui.showModal(_('Clear All Servers'), [
        E('p', _('Are you sure you want to clear all local servers? This action cannot be undone.')),
        E('div', { 'class': 'right' }, [
            E('button', { 'class': 'btn', 'click': ui.hideModal }, _('Cancel')),
            E('button', {
                'class': 'btn',
                'style': 'margin-left: 10px;',
                'click': async () => {
                    try {
                        editor.setValue('');
                        await handleSave();
                        ui.hideModal();
                    } catch (e) {
                        ui.addNotification(null, E('p', _('Failed to clear servers: %s').format(e.message)), 'error');
                        ui.hideModal();
                    }
                }
            }, _('Clear All'))
        ])
    ]);
}

function createHelpSection() {
    return E('div', { 'style': 'margin-bottom: 20px; padding: 15px; background: #e3f2fd; border-left: 4px solid #2196f3; border-radius: 4px;' }, [
        E('h4', { 'style': 'margin: 0 0 10px 0; color: #1976d2;' }, '📖 ' + _('How to use')),
        E('div', { 'style': 'font-size: 13px; line-height: 1.5; color: #424242;' }, [
            E('p', { 'style': 'margin: 5px 0;' }, _('1. Paste your server links (vless://, vmess://, trojan://, etc.) directly into the text area')),
            E('p', { 'style': 'margin: 5px 0;' }, _('2. Each server link should be on a separate line')),
            E('p', { 'style': 'margin: 5px 0;' }, _('3. Click "Save" to update your local server list')),
            E('p', { 'style': 'margin: 5px 0;' }, _('4. The servers will be automatically available in the PROXY group'))
        ])
    ]);
}

return view.extend({
    load: function() {
        // Read directly from persistent storage
        return fs.read_direct(localServersPath)
            .then(content => content || '')
            .catch(err => {
                ui.addNotification(null, E('p', _('Cannot read local servers file: %s').format(err.message)));
                return '';
            });
    },
    
    render: async function(content) {
        const helpSection = createHelpSection();
        
        const editorContainer = E('div', {
            'id': 'servers-editor',
            'style': 'width: 100%; height: 400px; margin-bottom: 15px; border: 1px solid #ddd; border-radius: 4px;'
        });
        
        const buttonContainer = E('div', { 'style': 'text-align: center; margin: 20px 0;' }, [
            E('button', {
                'class': 'btn',
                'click': handleSave
            }, _('Save Servers')),
            E('button', {
                'class': 'btn',
                'style': 'margin-left: 10px;',
                'click': handleClear
            }, _('Clear All'))
        ]);
        
        const view = E([
            E('h2', _('Local Servers list')),
            E('p', { 'class': 'cbi-section-descr' }, 
                _('Add proxy servers links to your local list without converting to Clash format. Add vless://, vmess://, trojan://, h2:// and others.')),
            helpSection,
            E('h3', _('Server Links Editor')),
            editorContainer,
            buttonContainer
        ]);
        
        // Initialize editor after DOM is ready
        setTimeout(() => {
            initializeAceEditor(content);
        }, 100);
        
        return view;
    },
    
    handleSave: null,
    handleSaveApply: null,
    handleReset: null
});