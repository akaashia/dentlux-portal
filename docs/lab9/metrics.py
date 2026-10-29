import sys
import numpy as np
import pandas as pd
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
 
path, start, end, tag = sys.argv[1:5]
s, e = pd.Timestamp(start), pd.Timestamp(end)
cols = ["created", "started", "review", "testing", "done"]
df = pd.read_csv(path, parse_dates=cols)
# бағанды өткізген карточка: бос күн келесі бағанның күнімен толтырылады
df[cols[1:]] = df[cols[1:]].bfill(axis=1)
 
# 1. Throughput: спринт ішінде Done бағанына өткен карточкалар
fin = df[df["done"].between(s, e)]
print(f"Throughput: {len(fin)}")
 
# 2. Cycle time: жұмысқа алудан Done-ға дейін (бастапқы күн қосылған)
ct = ((fin["done"] - fin["started"]).dt.days + 1).dropna().to_numpy()
if len(ct) > 0:
    print(f"Орташа cycle time: {ct.mean():.1f} күн")
    print(f"p85 cycle time: {np.percentile(ct, 85):.1f} күн")
    if len(ct) < 6:
        print("Ескерту: 6-дан аз карточка, p85 тұрақсыз")
else:
    print("cycle time: деректер жоқ")
 
# 3. Ашық карточкалардың жасы (aging)
opened = df[df["started"].notna() & df["done"].isna()]
aging = sorted(((e - opened["started"]).dt.days + 1).tolist(), reverse=True)
print(f"Ашық карточкалар жасы (күн): {aging}")
 
# 4. CFD: әр бағанға кірген күн бойынша жинақталған санау
days = pd.date_range(s, e)
cum = {c: np.array([(df[c] <= d).sum() for d in days]) for c in cols}
bands = [cum["done"],
         cum["testing"] - cum["done"],
         cum["review"] - cum["testing"],
         cum["started"] - cum["review"],
         cum["created"] - cum["started"]]
names = ["Done", "Тестілеуде", "Ревьюді күтеміз", "Әзірлеуде", "Ready/бэклог"]
wip_c = cum["started"] - cum["done"]
print(f"Максималды WIP: {wip_c.max()}")
 
# 5. Тар жер: жұмыс бағандарының орташа қалыңдығы (CFD-мен салыстырыңыз)
avg = dict(zip(names[1:4], [b.mean() for b in bands[1:4]]))
print("Орташа WIP бағандар бойынша:", {k: round(float(v), 1) for k, v in avg.items()})
print("Ең қалың жолақ (тар жер үміткері):", max(avg, key=avg.get))
 
fig, ax = plt.subplots(figsize=(9, 5))
ax.stackplot(days, *bands, labels=names,
             colors=["#8fbc8f", "#6aa84f", "#f4a460", "#f6d776", "#b0c4de"])
ax.set_title(f"Кумулятивтік ағын диаграммасы: {tag}")
ax.set_ylabel("Карточка саны (жинақталған)")
ax.legend(loc="upper left")
fig.autofmt_xdate()
fig.savefig(f"cfd_{tag}.png", dpi=150)
print(f"CFD сақталды: cfd_{tag}.png")
