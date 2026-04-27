type Props = {
  allLen: number;
};

export function QuietDayEmpty({ allLen }: Props) {
  return (
    <div className="quiet-day">
      <span className="breath" aria-hidden />
      <div className="text">
        <strong>Nothing matches.</strong> Try widening the filters — or take a breath.
        <span className="meta">{allLen} incidents in the archive · last scan 00:04 UTC</span>
      </div>
    </div>
  );
}
