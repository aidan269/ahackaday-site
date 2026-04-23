import OpenGraphImage from "./opengraph-image";

export const runtime = "nodejs";
export const size = {
  width: 1200,
  height: 630,
};
export const contentType = "image/png";

type Props = {
  params: Promise<{ slug: string }>;
};

export default async function Image(props: Props) {
  return OpenGraphImage(props);
}
