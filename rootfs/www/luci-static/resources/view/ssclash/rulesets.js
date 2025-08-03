'use strict';
'require view';
'require fs';
'require ui';

const editors = {};
const rulesetPath = '/opt/clash/lst/';

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

function handleCreate() {
    const nameInput = E('input', {
        'type': 'text',
        'class': 'cbi-input-text',
        'placeholder': _('e.g., my-custom-list')
    });

    const validationMessage = E('p', { 'style': 'color: red; display: none; margin-top: 10px;' });

    const validate = (value) => {
        if (!/^[a-zA-Z0-9_-]+$/.test(value)) {
            validationMessage.textContent = _('Invalid name. Only letters, numbers, underscores, and hyphens are allowed.');
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

return view.extend({
    load: function() {
        return fs.list(rulesetPath)
            .then(files => {
                const txtFiles = files.filter(file => file.name.endsWith('.txt'));
                const promises = txtFiles.map(file =>
                    fs.read_direct(`${rulesetPath}${file.name}`)
                      .then(content => ({ name: file.name, content: content || '' }))
                );
                return Promise.all(promises);
            })
            .catch(err => {
                ui.addNotification(null, E('p', _('Cannot read ruleset directory: %s').format(err.message)));
                return [];
            });
    },

    render: function(rulesets = []) {
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

        return E('div', {}, [
            style,
            E('div', { class: 'cbi-section' }, [
                E('div', { 'style': 'display: flex; justify-content: space-between; align-items: center;' }, [
                    E('h2', _('Local Rulesets')),
                    E('button', { 'class': 'btn', 'click': handleCreate }, _('Create New List'))
                ]),
                E('p', { class: 'cbi-section-descr' }, [
                    _('Here you can manage local lists for use in rule-providers. Example usage in your config.yaml: type: file, format: text, path: ./lst/your-list.txt')
                ])
            ]),
            ...sections
        ]);
    },

    handleSaveApply: null,
    handleSave: null,
    handleReset: null
});
