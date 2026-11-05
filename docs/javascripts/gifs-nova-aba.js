// Os GIFs da demonstração abrem em nova aba no site. No Markdown o link fica simples, porque o
// GitHub não entende o target (nem o attr_list do mkdocs) e mostraria o texto solto.
document.querySelectorAll('a[href$=".gif"]').forEach(function (a) {
    a.target = '_blank';
    a.rel = 'noopener';
});
