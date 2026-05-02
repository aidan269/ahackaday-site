/** Weight practitioner votes highest, then discussion depth, then passive saves. */
export function computeCommunityScore(input: {
  voteScore: number;
  commentCount: number;
  saveCount: number;
}): number {
  return input.voteScore * 3 + input.commentCount * 2 + input.saveCount * 1;
}

export function practitionerBadgeEligible(input: {
  communityScore: number;
  upvotes: number;
}): boolean {
  return input.communityScore >= 12 && input.upvotes >= 3;
}
