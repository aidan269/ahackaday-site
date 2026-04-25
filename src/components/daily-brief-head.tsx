type Props = {
  dateStr: string;
  filteredLen: number;
  allLen: number;
  todayCrit: number;
  actCount: number;
};

export function DailyBriefHead({ dateStr, filteredLen, allLen, todayCrit, actCount }: Props) {
  const hot = todayCrit > 0 || actCount > 0;
  const skim = Math.max(0, filteredLen - todayCrit - actCount);

  return (
    <>
      <div className={`dailybrief${hot ? " is-hot" : ""}`}>
        <span className="dailybrief__pulse" aria-hidden />
        <span className="dailybrief__date">your security situation · {dateStr}</span>
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
            {todayCrit > 0 ? (
              <>
                <span className="accent">{todayCrit}</span> critical
              </>
            ) : null}
            {todayCrit > 0 && actCount > 0 ? " · " : ""}
            {actCount > 0 ? (
              <>
                <span className="accent">{actCount}</span> actively exploited
              </>
            ) : null}
            {(todayCrit > 0 || actCount > 0) && (
              <>
                {" · "}
                {skim} to skim · {actCount > 0 ? "watch for follow-on" : "nothing on fire"}
              </>
            )}
          </>
        ) : (
          <>{allLen} scanned. Nothing on fire. Read at your own pace.</>
        )}
      </p>
    </>
  );
}
