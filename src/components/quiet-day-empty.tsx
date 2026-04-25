type Props = {
  allLen: number;
  scanUtc: string;
};

export function QuietDayEmpty({ allLen, scanUtc }: Props) {
  return (
    <div className="quiet-day">
      <span className="quiet-day__breath" aria-hidden />
      <div className="quiet-day__text">
        <strong>Nothing matches.</strong> Try widening the filters — or take a breath.
        <span className="quiet-day__meta">
          {allLen} incidents in the archive · last scan {scanUtc} UTC
        </span>
      </div>
    </div>
  );
}
