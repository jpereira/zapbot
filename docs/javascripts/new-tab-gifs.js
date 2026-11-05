// The demo GIFs open in a new tab on the site. In Markdown the link stays simple, because the
// GitHub does not understand the target (nor mkdocs' attr_list) and would show the loose text.
document.querySelectorAll('a[href$=".gif"]').forEach(function (a) {
    a.target = '_blank';
    a.rel = 'noopener';
});
