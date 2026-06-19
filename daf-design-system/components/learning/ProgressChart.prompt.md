Vocabulary progress chart — range tabs (7 kun / 1 oy / 6 oy / 1 yil), a lightweight SVG line chart with dashed grid + x labels, and an optional legend. Pure SVG, no chart library.

```jsx
<ProgressChart
  labels={['Shan','Yak','Du','Se','Chor','Pay','Ju']}
  series={[
    { data:[0,1,1,2,2,3,4], color:'var(--sky-500)' },
    { data:[0,0,1,1,2,2,3], color:'var(--amber-500)' },
  ]}
  legend={[
    { value:4, label:'Yangi so‘zlar', color:'var(--sky-500)' },
    { value:3, label:'O‘rganilayotgan so‘zlar', color:'var(--amber-500)' },
  ]} />
```
