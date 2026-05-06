type Props = {
  dateStr: string;
  filteredLen: number;
  allLen: number;
  todayCrit: number;
  actCount: number;
  dataSourceLabel: string;
};

export function DailyBriefHead({ dateStr, filteredLen, allLen, todayCrit, actCount, dataSourceLabel }: Props) {
  const hot = todayCrit > 0 || actCount > 0;
  const skim = Math.max(0, filteredLen - todayCrit - actCount);

  return (
    <>
      <div className={`dailybrief${hot ? " is-hot" : ""}`}>
        <span className="pulse" aria-hidden />
        <span className="date">Your Security Digest · {dateStr}</span>
      </div>
      <h1 className="page-title">
        {hot ? (
          <>
            Today, <span className="dim">{filteredLen} things</span> to read<span className="accent">.</span>
          </>
        ) : (
          <>
            Quiet today<span className="accent">.</span>
          </>
        )}
      </h1>
      <p className="todays-line">
        {hot ? (
          <>
            <span className="accent">{todayCrit || actCount}</span>{" "}
            {todayCrit ? "critical " : "actively exploited "}· {skim} to skim ·{" "}
            {actCount ? "1 to act on" : "nothing on fire"}
          </>
        ) : (
          <>{allLen} scanned. Nothing on fire. Read at your own pace.</>
        )}
      </p>
      <p className="todays-line">Data source: {dataSourceLabel}</p>
    </>
  );
}
