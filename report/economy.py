import json,math,pathlib,statistics
ROOT=pathlib.Path(__file__).resolve().parent
runs=[json.loads(p.read_text()) for p in (ROOT.parent/'evaluation').glob('*.json') if p.name!='summary.json']
results=[x['result'] for x in runs if isinstance(x,dict) and 'elapsed_seconds' in x.get('result',{})]
latency=statistics.mean(r['elapsed_seconds'] for r in results) if results else 90
# All money, wattage and labor-time inputs are educational assumptions, not measured tariffs.
inputs={'development_hours':40,'data_hours':8,'qa_hours':8,'onboarding_hours':4,'hour_rub':600,'support_hours_month':2,'device_rub':90000,'device_months':36,'allocated_device_fraction':0.2,'power_kw':0.03,'electricity_rub_kwh':8,'manual_minutes':5,'review_minutes':1.5,'horizon_months':12,'mean_observed_latency_seconds':latency,'input_api_rub_per_million':0,'output_api_rub_per_million':0}
initial=sum(inputs[k] for k in ['development_hours','data_hours','qa_hours','onboarding_hours'])*inputs['hour_rub']
fixed=inputs['support_hours_month']*inputs['hour_rub']+inputs['device_rub']/inputs['device_months']*inputs['allocated_device_fraction']
energy=inputs['power_kw']*(latency/3600)*inputs['electricity_rub_kwh']
savings_minutes=inputs['manual_minutes']-inputs['review_minutes']-latency/60
benefit=savings_minutes*inputs['hour_rub']/60;net=benefit-energy
cases=[]
for manual in [2,3,5,8]:
 b=(manual-inputs['review_minutes']-latency/60)*inputs['hour_rub']/60-energy
 cases.append({'manual_minutes':manual,'net_value_per_task':b,'year_break_even_tasks':math.ceil((initial+12*fixed)/b) if b>0 else None})
model={'inputs':inputs,'initial_rub':initial,'fixed_month_rub':fixed,'energy_per_task_rub':energy,'api_cost_per_call_rub':0,'saved_minutes_per_task':savings_minutes,'value_per_task_rub':benefit,'net_per_task_rub':net,'operating_break_even_tasks_month':math.ceil(fixed/net) if net>0 else None,'year_break_even_tasks':math.ceil((initial+12*fixed)/net) if net>0 else None,'sensitivity':cases,'note':'Окупаемость через условную стоимость высвобожденного рабочего времени, не выручку и не доказанную экономию денег. Нужен пилот. Для любительской игры денежная окупаемость не установлена.'}
(ROOT/'economy.json').write_text(json.dumps(model,ensure_ascii=False,indent=2));print(json.dumps(model,ensure_ascii=False,indent=2))
