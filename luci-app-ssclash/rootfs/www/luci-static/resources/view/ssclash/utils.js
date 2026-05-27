'use strict';

return L.Class.extend({
    isLightTheme: function() {
        if (document.documentElement.dataset.bsTheme === 'dark') return false;
        if (document.documentElement.dataset.bsTheme === 'light') return true;
        const bg = window.getComputedStyle(document.body).backgroundColor;
        const m = bg.match(/\d+/g);
        if (m && m.length >= 3)
            return (0.299 * +m[0] + 0.587 * +m[1] + 0.114 * +m[2]) / 255 > 0.5;
        return true;
    }
});
