'use client';
/** Holds the one piece of state the two halves share: "something changed". */
import { useState } from 'react';
import { AddGarment } from './AddGarment';
import { WardrobeList } from './WardrobeList';

export function WardrobeScreen() {
  const [refreshKey, setRefreshKey] = useState(0);
  return (
    <>
      <AddGarment onSaved={() => setRefreshKey((k) => k + 1)} />
      <WardrobeList refreshKey={refreshKey} />
    </>
  );
}
