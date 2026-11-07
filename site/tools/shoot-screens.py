"""Erzeugt die Beispiel-Aufnahmen der Landingpage (site/img/*.webp, Quellen 1080x2400).

Ablauf: Die App läuft lokal (npx vite --port 4310 mit VITE_SUPABASE_URL und einem beliebigen Platzhalter-Schlüssel).
Alle Anfragen an Supabase werden im Browser abgefangen und mit den Beispieldaten unten beantwortet:
nichts geht ins Internet, es werden keine echten Konten oder Daten gelesen oder geschrieben.
Der KI-Assistent wird nur in der Startansicht aufgenommen (es wird keine Antwort erfunden).
Aufruf: python3 site/tools/shoot-screens.py heute erinnerungen gesundheit assistent notfallkarte   (Ausgabe: retake/*.png)
Danach auf 540x1200 skalieren und als WebP (Qualität 80) nach site/img/ legen.
"""
import json,sys,base64,time,re
from playwright.sync_api import sync_playwright
SB='https://cpnbkegojxagbzkomzap.supabase.co'
APP='http://localhost:4310/app'
UID='11111111-1111-4111-8111-111111111111'
PET='22222222-2222-4222-8222-222222222222'
M1='33333333-3333-4333-8333-333333333331'; M2='33333333-3333-4333-8333-333333333332'
def b64(o): return base64.urlsafe_b64encode(json.dumps(o).encode()).decode().rstrip('=')
exp=int(time.time())+86400*30
tok=f"{b64({'alg':'HS256','typ':'JWT'})}.{b64({'sub':UID,'role':'authenticated','aud':'authenticated','exp':exp,'email':'alex@example.invalid'})}.sig"
user={'id':UID,'aud':'authenticated','role':'authenticated','email':'alex@example.invalid','email_confirmed_at':'2026-10-01T08:00:00Z','user_metadata':{'display_name':'Alex','language':'de'},'app_metadata':{'provider':'email'},'identities':[{'id':UID,'provider':'email'}],'created_at':'2026-10-01T08:00:00Z'}
session={'access_token':tok,'token_type':'bearer','expires_in':86400,'expires_at':exp,'refresh_token':'r','user':user}
TS='2026-10-01T08:00:00Z'
pet={'id':PET,'owner_id':UID,'name':'Luna','species':'dog','species_other':None,'breed':'Labrador-Mix','sex':'female','birth_date':'2021-04-12','chip_no':None,'allergies':'Huhn','medications':None,'emergency_contact':None,'owner_phone':'0000 654321','vet_name':None,'vet_phone':None,'photo_path':None,'cat_outdoor':None,'stable':None,'deceased':False,'created_at':TS,'updated_at':TS}
def ri(i,kind,t): return {'id':f'44444444-4444-4444-8444-44444444444{i}','pet_id':PET,'owner_id':UID,'kind':kind,'label':None,'time_of_day':t,'repeat':'daily','reminder_on':True,'created_at':TS}
T={
 'pets':[pet],
 'profiles':[{'id':UID,'display_name':'Alex','language':'de','created_at':TS}],
 'pet_members':[{'pet_id':PET,'user_id':UID,'role':'owner','created_at':TS}],
 'routine_items':[ri(1,'walk','07:00:00'),ri(2,'feed','07:30:00'),ri(3,'walk','12:30:00'),ri(4,'feed','18:00:00'),ri(5,'walk','20:00:00')],
 'routine_done':[],
 'pet_medications':[
   {'id':M2,'pet_id':PET,'owner_id':UID,'name':'Omega-3-Öl','amount':2,'unit':'pipette','frequency':'daily','times':['18:00'],'intake_hint':'none','note':None,'reason':None,'prescribed_by':None,'remind':True,'source':'owner','starts_on':'2026-09-01','ends_on':None,'stopped_on':None,'created_at':TS,'updated_at':TS},
   {'id':M1,'pet_id':PET,'owner_id':UID,'name':'Meloxicam','amount':0.5,'unit':'ml','frequency':'daily','times':['08:00','19:30'],'intake_hint':'with_food','note':None,'reason':'Gelenkschmerzen','prescribed_by':'Tierarztpraxis Beispiel','remind':True,'source':'owner','starts_on':'2026-10-10','ends_on':'2026-10-30','stopped_on':None,'created_at':TS,'updated_at':TS}],
 'vaccinations':[{'id':'66666666-6666-4666-8666-666666666661','pet_id':PET,'owner_id':UID,'name':'Tollwut','given_on':'2026-10-02','valid_until':'2027-10-02','source':'owner','created_at':TS},{'id':'66666666-6666-4666-8666-666666666662','pet_id':PET,'owner_id':UID,'name':'Staupe, Hepatitis, Parvovirose (SHP)','given_on':'2026-03-14','valid_until':'2029-03-14','source':'owner','created_at':TS}],
 'medication_doses':[{'id':'55555555-5555-4555-8555-555555555551','medication_id':M1,'pet_id':PET,'given_by':UID,'given_at':'2026-10-16T06:05:00Z','scheduled_on':'2026-10-16','scheduled_time':'08:00:00'}],
}
def handle(route,request=None):
    r=route.request; u=r.url.replace(SB,'')
    cors={'access-control-allow-origin':'*','access-control-allow-headers':'*','access-control-allow-methods':'*','access-control-expose-headers':'*'}
    if r.method=='OPTIONS': return route.fulfill(status=204,headers=cors)
    if u.startswith('/auth/v1/user'): return route.fulfill(status=200,content_type='application/json',headers=cors,body=json.dumps(user))
    m=re.match(r'/rest/v1/([a-z_]+)',u)
    if m and not u.startswith('/rest/v1/rpc/'):
        rows=T.get(m.group(1),[])
        if r.method!='GET': rows=[]
        if 'pgrst.object' in (r.headers.get('accept') or ''):
            return route.fulfill(status=200 if rows else 406,content_type='application/json',headers=cors,body=json.dumps(rows[0] if rows else {'code':'PGRST116','message':'none'}))
        return route.fulfill(status=200,content_type='application/json',headers=cors,body=json.dumps(rows))
    if u.startswith('/rest/v1/rpc/'): return route.fulfill(status=200,content_type='application/json',headers=cors,body='null')
    return route.fulfill(status=200,content_type='application/json',headers=cors,body='[]')
which=sys.argv[1:] or ['heute','erinnerungen','tierakte','notfallkarte']
with sync_playwright() as p:
    b=p.chromium.launch()
    ctx=b.new_context(viewport={'width':360,'height':800},device_scale_factor=3,locale='de-DE',timezone_id='Europe/Berlin',service_workers='block',is_mobile=True,has_touch=True)
    ctx.add_init_script(f"localStorage.setItem('sb-cpnbkegojxagbzkomzap-auth-token', {json.dumps(json.dumps(session))});")
    pg=ctx.new_page(); pg.clock.set_fixed_time('2026-10-16T08:40:00+02:00'); pg.route(SB+'/**',handle)
    errs=[]; pg.on('pageerror',lambda e:errs.append(str(e)))
    def shot(name,path,pre=None):
        pg.goto(APP+path); pg.wait_for_timeout(2000)
        if pre: pre()
        pg.wait_for_timeout(500); pg.screenshot(path=f'retake/{name}.png'); print(name,pg.url)
    if 'heute' in which: shot('heute','/')
    if 'erinnerungen' in which: shot('erinnerungen','/erinnerungen')
    if 'tierakte' in which: shot('tierakte','/tier')
    if 'gesundheit' in which:
        def pre():
            pg.get_by_role('tab',name='Gesundheit').click(); pg.wait_for_timeout(800)
            pg.evaluate('window.scrollBy(0,420)'); pg.wait_for_timeout(500)
        shot('tierakte-verlauf','/tier',pre)
    if 'assistent' in which: shot('assistent','/mehr/assistent')
    if 'notfallkarte' in which: shot('notfallkarte',f'/tier/{PET}/notfallkarte')
    print(errs[:3]); b.close()
