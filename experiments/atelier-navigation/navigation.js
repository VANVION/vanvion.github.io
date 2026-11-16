/* Approved default navigation on the existing catalogue; no data or routing changes. */
(() => {
  const navigation=new URLSearchParams(location.search).get('navigation');
  if (navigation && navigation !== 'atelier') return;
  document.body.classList.add('atelier-nav');
  const css=document.createElement('link'); css.rel='stylesheet'; css.href='experiments/atelier-navigation/navigation.css'; document.head.append(css);
  const sidebar=$('sidebar');
  const intro=document.createElement('div'); intro.className='an-intro'; sidebar.prepend(intro);
  const groups=[
    {id:'liningBar',title:()=>L('Подкладка','Lining')},
    {id:'fabricBar',title:()=>L('Ткань','Fabric')},
    {id:'colorBar',title:()=>L('Цвет','Colour')}
  ];
  for(const group of groups){
    const bar=$(group.id), details=document.createElement('details');
    details.className='an-filter'; details.dataset.filter=group.id;
    const summary=document.createElement('summary'); summary.innerHTML='<span class="an-title"></span><span class="an-current"></span><span class="an-toggle" aria-hidden="true">+</span>';
    bar.before(details); details.append(summary,bar); group.details=details;
  }
  const reset=document.createElement('button'); reset.type='button'; reset.className='an-reset'; sidebar.append(reset);
  reset.onclick=()=>{
    QUERY=''; COLOR=''; FABRIC=''; LINING='';
    $('search').value=''; $('searchClear').classList.remove('show');
    render(); $('search').focus();
  };
  const desktop=matchMedia('(min-width:900px)');
  const layout=()=>groups.forEach(group=>{group.details.open=desktop.matches;});
  desktop.addEventListener('change',layout); layout();
  function update(){
    intro.textContent=L('Подбор модели','Find your model');
    $('search').placeholder=L('Артикул или название','Article or name');
    $('search').setAttribute('aria-label',L('Поиск по артикулу или названию','Search by article or name'));
    $('searchClear').setAttribute('aria-label',L('Очистить поиск','Clear search'));
    $('langBtn').setAttribute('aria-label',L('Выбрать язык','Choose language'));
    $('tabs').setAttribute('role','group'); $('tabs').setAttribute('aria-label',L('Категории','Categories'));
    for(const group of groups){
      const bar=$(group.id), details=group.details;
      details.hidden=!bar.children.length;
      details.querySelector('.an-title').textContent=group.title();
      const active=bar.querySelector('.active');
      const selected=group.id==='colorBar'?Boolean(COLOR):group.id==='fabricBar'?Boolean(FABRIC):Boolean(LINING);
      details.querySelector('.an-current').textContent=selected && active ? active.textContent.trim() : L('Все','All');
    }
    sidebar.querySelectorAll('.tab,.ln,.cf').forEach(button=>button.setAttribute('aria-pressed',String(button.classList.contains('active'))));
    reset.textContent=L('Сбросить фильтры и поиск','Clear filters and search');
    reset.hidden=!(QUERY||COLOR||FABRIC||LINING);
  }
  const originalRender=render;
  render=function(){const result=originalRender();update();return result;};
  update();
})();
