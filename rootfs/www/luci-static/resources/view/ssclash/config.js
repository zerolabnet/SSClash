'use strict';
'require view';
'require fs';
'require ui';
'require rpc';

var isReadonlyView = !L.hasViewPermission() || null;
let startStopButton = null;

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
		.catch(function(e) {
			ui.addNotification(null, E('p', _('Unable to start service: %s').format(e.message)), 'error');
		})
		.finally(() => {
			if (startStopButton) startStopButton.disabled = false;
		});
}

async function stopService() {
	if (startStopButton) startStopButton.disabled = true;
	return fs.exec('/etc/init.d/clash', ['stop'])
		.catch(function(e) {
			ui.addNotification(null, E('p', _('Unable to stop service: %s').format(e.message)), 'error');
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
	window.location.reload();
}

async function openDashboard() {
	let newWindow = window.open('', '_blank');
	const running = await getServiceStatus();
	if (running) {
		let url = `http://${window.location.hostname}:9090/ui/?hostname=${window.location.hostname}&port=9090`;
		newWindow.location.href = url;
	} else {
		newWindow.close();
		alert(_('Service is not running.'));
	}
}

return view.extend({
	load: function() {
		return L.resolveDefault(fs.read('/opt/clash/config.yaml'), '');
	},
	handleSaveApply: function(ev) {
		var value = (document.querySelector('textarea').value || '').trim().replace(/\r\n/g, '\n') + '\n';
		return fs.write('/opt/clash/config.yaml', value).then(function(rc) {
			document.querySelector('textarea').value = value;
			ui.addNotification(null, E('p', _('Contents have been saved.')), 'info');
			return fs.exec('/etc/init.d/clash', ['reload']);
		}).then(function() {
			window.location.reload();
		}).catch(function(e) {
			ui.addNotification(null, E('p', _('Unable to save contents: %s').format(e.message)), 'error');
		});
	},
	render: async function(config) {
		const running = await getServiceStatus();

		return E([
			E('button', {
				'class': 'btn',
				'click': openDashboard
			}, _('Open Dashboard')),
			(startStopButton = E('button', {
				'class': 'btn',
				'click': toggleService,
				'style': 'margin-left: 10px;'
			}, running ? _('Stop service') : _('Start service'))),
			E('span', {
				'style': running ? 'color: green; margin-left: 10px;' : 'color: red; margin-left: 10px;'
			}, running ? _('Clash is running') : _('Clash stopped')),
			E('h2', _('Clash config')),
			E('p', { 'class': 'cbi-section-descr' }, _('Your current Clash config. When applied, the changes will be saved and the service will be restarted.')),
			E('textarea', {
				'style': 'width: 100% !important; padding: 5px; font-family: monospace',
				'rows': 35,
				'disabled': isReadonlyView
			}, [config != null ? config : ''])
		]);
	},
	handleSave: null,
	handleReset: null
});
