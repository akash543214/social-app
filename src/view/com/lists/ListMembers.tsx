import React from 'react'
import {
  ActivityIndicator,
  Dimensions,
  StyleProp,
  View,
  ViewStyle,
} from 'react-native'
import {AppBskyActorDefs, AppBskyGraphDefs} from '@atproto/api'
import {List, ListRef} from '../util/List'
import {ProfileCardFeedLoadingPlaceholder} from '../util/LoadingPlaceholder'
import {ErrorMessage} from '../util/error/ErrorMessage'
import {LoadMoreRetryBtn} from '../util/LoadMoreRetryBtn'
import {ProfileCard} from '../profile/ProfileCard'
import {Button} from '../util/forms/Button'
import {useAnalytics} from 'lib/analytics/analytics'
import {useWebMediaQueries} from 'lib/hooks/useWebMediaQueries'
import {useListMembersQuery} from '#/state/queries/list-members'
import {logger} from '#/logger'
import {useModalControls} from '#/state/modals'
import {useSession} from '#/state/session'
import {cleanError} from '#/lib/strings/errors'

const LOADING_ITEM = {_reactKey: '__loading__'}
const EMPTY_ITEM = {_reactKey: '__empty__'}
const ERROR_ITEM = {_reactKey: '__error__'}
const LOAD_MORE_ERROR_ITEM = {_reactKey: '__load_more_error__'}

export function ListMembers({
  list,
  style,
  scrollElRef,
  onScrolledDownChange,
  onPressTryAgain,
  renderHeader,
  renderEmptyState,
  testID,
  headerOffset = 0,
  desktopFixedHeightOffset,
}: {
  list: string
  style?: StyleProp<ViewStyle>
  scrollElRef?: ListRef
  onScrolledDownChange: (isScrolledDown: boolean) => void
  onPressTryAgain?: () => void
  renderHeader: () => JSX.Element
  renderEmptyState: () => JSX.Element
  testID?: string
  headerOffset?: number
  desktopFixedHeightOffset?: number
}) {
  const {track} = useAnalytics()
  const [isRefreshing, setIsRefreshing] = React.useState(false)
  const {isMobile} = useWebMediaQueries()
  const {openModal} = useModalControls()
  const {currentAccount} = useSession()

  const {
    data,
    isFetching,
    isFetched,
    isError,
    error,
    refetch,
    fetchNextPage,
    hasNextPage,
  } = useListMembersQuery(list)
  const isEmpty = !isFetching && !data?.pages[0].items.length
  const isOwner =
    currentAccount && data?.pages[0].list.creator.did === currentAccount.did

  const items = React.useMemo(() => {
    let items: any[] = []
    if (isFetched) {
      if (isEmpty && isError) {
        items = items.concat([ERROR_ITEM])
      }
      if (isEmpty) {
        items = items.concat([EMPTY_ITEM])
      } else if (data) {
        for (const page of data.pages) {
          items = items.concat(page.items)
        }
      }
      if (!isEmpty && isError) {
        items = items.concat([LOAD_MORE_ERROR_ITEM])
      }
    } else if (isFetching) {
      items = items.concat([LOADING_ITEM])
    }
    return items
  }, [isFetched, isEmpty, isError, data, isFetching])

  // events
  // =

  const onRefresh = React.useCallback(async () => {
    track('Lists:onRefresh')
    setIsRefreshing(true)
    try {
      await refetch()
    } catch (err) {
      logger.error('Failed to refresh lists', {error: err})
    }
    setIsRefreshing(false)
  }, [refetch, track, setIsRefreshing])

  const onEndReached = React.useCallback(async () => {
    if (isFetching || !hasNextPage || isError) return
    track('Lists:onEndReached')
    try {
      await fetchNextPage()
    } catch (err) {
      logger.error('Failed to load more lists', {error: err})
    }
  }, [isFetching, hasNextPage, isError, fetchNextPage, track])

  const onPressRetryLoadMore = React.useCallback(() => {
    fetchNextPage()
  }, [fetchNextPage])

  const onPressEditMembership = React.useCallback(
    (profile: AppBskyActorDefs.ProfileViewBasic) => {
      openModal({
        name: 'user-add-remove-lists',
        subject: profile.did,
        displayName: profile.displayName || profile.handle,
        handle: profile.handle,
      })
    },
    [openModal],
  )

  // rendering
  // =

  const renderMemberButton = React.useCallback(
    (profile: AppBskyActorDefs.ProfileViewBasic) => {
      if (!isOwner) {
        return null
      }
      return (
        <Button
          testID={`user-${profile.handle}-editBtn`}
          type="default"
          label="Edit"
          onPress={() => onPressEditMembership(profile)}
        />
      )
    },
    [isOwner, onPressEditMembership],
  )

  const renderItem = React.useCallback(
    ({item}: {item: any}) => {
      if (item === EMPTY_ITEM) {
        return renderEmptyState()
      } else if (item === ERROR_ITEM) {
        return (
          <ErrorMessage
            message={cleanError(error)}
            onPressTryAgain={onPressTryAgain}
          />
        )
      } else if (item === LOAD_MORE_ERROR_ITEM) {
        return (
          <LoadMoreRetryBtn
            label="There was an issue fetching the list. Tap here to try again."
            onPress={onPressRetryLoadMore}
          />
        )
      } else if (item === LOADING_ITEM) {
        return <ProfileCardFeedLoadingPlaceholder />
      }
      return (
        <ProfileCard
          testID={`user-${
            (item as AppBskyGraphDefs.ListItemView).subject.handle
          }`}
          profile={(item as AppBskyGraphDefs.ListItemView).subject}
          renderButton={renderMemberButton}
          style={{paddingHorizontal: isMobile ? 8 : 14, paddingVertical: 4}}
        />
      )
    },
    [
      renderMemberButton,
      renderEmptyState,
      error,
      onPressTryAgain,
      onPressRetryLoadMore,
      isMobile,
    ],
  )

  const Footer = React.useCallback(
    () => (
      <View style={{paddingTop: 20, paddingBottom: 400}}>
        {isFetching && <ActivityIndicator />}
      </View>
    ),
    [isFetching],
  )

  return (
    <View testID={testID} style={style}>
      <List
        testID={testID ? `${testID}-flatlist` : undefined}
        ref={scrollElRef}
        data={items}
        keyExtractor={(item: any) => item.subject?.did || item._reactKey}
        renderItem={renderItem}
        ListHeaderComponent={renderHeader}
        ListFooterComponent={Footer}
        refreshing={isRefreshing}
        onRefresh={onRefresh}
        headerOffset={headerOffset}
        contentContainerStyle={{
          minHeight: Dimensions.get('window').height * 1.5,
        }}
        onScrolledDownChange={onScrolledDownChange}
        onEndReached={onEndReached}
        onEndReachedThreshold={0.6}
        removeClippedSubviews={true}
        // @ts-ignore our .web version only -prf
        desktopFixedHeight={desktopFixedHeightOffset || true}
      />
    </View>
  )
}
